export interface ParsedIcalEvent {
  uid: string;
  title: string;
  notes?: string;
  location?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
}

export interface ParseIcalOptions {
  /** 日曆預設時區，例如 Asia/Taipei */
  defaultTimeZone?: string;
}

function unfoldIcal(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function parseProperty(line: string): { name: string; value: string; params: Record<string, string> } {
  const colonIndex = line.indexOf(":");
  const rawName = colonIndex >= 0 ? line.slice(0, colonIndex) : line;
  const value = colonIndex >= 0 ? line.slice(colonIndex + 1) : "";
  const [name, ...paramParts] = rawName.split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const [key, paramValue] = part.split("=");
    if (key && paramValue) {
      params[key.toUpperCase()] = paramValue;
    }
  }
  return { name: name.toUpperCase(), value, params };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatUtcToTimeZone(isoUtc: string, timeZone: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (timeZone === "Asia/Taipei") {
    const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return `${taipei.getUTCFullYear()}-${pad(taipei.getUTCMonth() + 1)}-${pad(taipei.getUTCDate())}T${pad(taipei.getUTCHours())}:${pad(taipei.getUTCMinutes())}`;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function parseCompactDateTime(value: string): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  isUtc: boolean;
} | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/i);
  if (!match) {
    return null;
  }
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4] ?? "00",
    minute: match[5] ?? "00",
    second: match[6] ?? "00",
    isUtc: Boolean(match[7]),
  };
}

function parseIcalDate(
  value: string,
  params: Record<string, string>,
  options: ParseIcalOptions = {},
): { startAt: string; allDay: boolean } {
  const trimmed = value.trim();
  const timeZone = params.TZID ?? options.defaultTimeZone ?? "Asia/Taipei";

  if (params.VALUE === "DATE") {
    const digits = trimmed.replace(/[^\d]/g, "").slice(0, 8);
    const compact = parseCompactDateTime(`${digits}T000000`);
    if (compact) {
      return {
        startAt: `${compact.year}-${compact.month}-${compact.day}T00:00`,
        allDay: true,
      };
    }
  }

  const compact = parseCompactDateTime(trimmed.replace(/[^\dTZ]/gi, ""));
  if (!compact) {
    return { startAt: "", allDay: false };
  }

  if (params.VALUE === "DATE" || (!compact.hour && !trimmed.includes("T"))) {
    return {
      startAt: `${compact.year}-${compact.month}-${compact.day}T00:00`,
      allDay: true,
    };
  }

  if (compact.isUtc) {
    const converted = formatUtcToTimeZone(
      `${compact.year}-${compact.month}-${compact.day}T${compact.hour}:${compact.minute}:${compact.second}Z`,
      timeZone,
    );
    if (converted) {
      return { startAt: converted, allDay: false };
    }
  }

  return {
    startAt: `${compact.year}-${compact.month}-${compact.day}T${compact.hour}:${compact.minute}`,
    allDay: false,
  };
}

function unescapeIcalText(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function isValidCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value) && !value.includes("NaN");
}

function eventOverlapsRange(
  event: ParsedIcalEvent,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  if (!isValidCalendarDate(event.startAt) || !isValidCalendarDate(event.endAt)) {
    return false;
  }
  const eventStartDay = event.startAt.slice(0, 10);
  const eventEndDay = event.endAt.slice(0, 10);
  return eventStartDay <= rangeEnd && eventEndDay >= rangeStart;
}

export function parseIcalEvents(
  text: string,
  rangeStart?: string,
  rangeEnd?: string,
  options: ParseIcalOptions = {},
): ParsedIcalEvent[] {
  const unfolded = unfoldIcal(text);
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const events: ParsedIcalEvent[] = [];

  for (const block of blocks) {
    const chunk = block.split("END:VEVENT")[0] ?? "";
    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
    const fields = new Map<string, { value: string; params: Record<string, string> }>();

    for (const line of lines) {
      const parsed = parseProperty(line);
      fields.set(parsed.name, { value: parsed.value, params: parsed.params });
    }

    const uid = fields.get("UID")?.value;
    const summary = fields.get("SUMMARY")?.value;
    const dtStart = fields.get("DTSTART");
    const dtEnd = fields.get("DTEND");
    if (!uid || !summary || !dtStart) {
      continue;
    }

    const start = parseIcalDate(dtStart.value, dtStart.params, options);
    if (!start.startAt || !isValidCalendarDate(start.startAt)) {
      continue;
    }

    let endAt = start.startAt;
    let allDay = start.allDay;

    if (dtEnd) {
      const end = parseIcalDate(dtEnd.value, dtEnd.params, options);
      if (end.startAt && isValidCalendarDate(end.startAt)) {
        endAt = end.startAt;
        allDay = allDay || end.allDay;

        if (allDay && endAt > start.startAt) {
          const endDate = new Date(`${endAt.slice(0, 10)}T12:00:00`);
          endDate.setDate(endDate.getDate() - 1);
          endAt = `${formatLocalDate(endDate).slice(0, 10)}T23:59`;
        }
      }
    } else if (!allDay) {
      const endDate = new Date(`${start.startAt}:00`);
      endDate.setHours(endDate.getHours() + 1);
      endAt = formatLocalDate(endDate);
    }

    if (!isValidCalendarDate(endAt) || endAt < start.startAt) {
      endAt = allDay ? `${start.startAt.slice(0, 10)}T23:59` : start.startAt;
    }

    const description = fields.get("DESCRIPTION")?.value;
    const location = fields.get("LOCATION")?.value;
    const notes = [description, location ? `地點：${location}` : undefined]
      .filter((value): value is string => Boolean(value))
      .map(unescapeIcalText)
      .join("\n");

    const event: ParsedIcalEvent = {
      uid,
      title: unescapeIcalText(summary.trim()) || "（無標題）",
      notes: notes || undefined,
      location: location ? unescapeIcalText(location) : undefined,
      startAt: start.startAt,
      endAt,
      allDay,
    };

    if (rangeStart && rangeEnd && !eventOverlapsRange(event, rangeStart, rangeEnd)) {
      continue;
    }

    events.push(event);
  }

  return events.sort((left, right) => left.startAt.localeCompare(right.startAt));
}

export function extractIcalCalendarName(text: string): string | undefined {
  const match = unfoldIcal(text).match(/X-WR-CALNAME:(.+)/);
  return match?.[1] ? unescapeIcalText(match[1].trim()) : undefined;
}

export function extractIcalCalendarTimeZone(text: string): string | undefined {
  const match = unfoldIcal(text).match(/X-WR-TIMEZONE:(.+)/);
  return match?.[1]?.trim();
}
