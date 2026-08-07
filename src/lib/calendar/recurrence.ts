import { addDays, formatDateOnly, parseLocalDateTime } from "@/lib/calendar/time-grid";
import type {
  CalendarEvent,
  ExpandedCalendarEvent,
  RecurrenceException,
  RecurrenceRule,
} from "@/types/calendar-event";

const MAX_OCCURRENCES = 366;

function applyOverrideToOccurrence(
  base: ExpandedCalendarEvent,
  override: NonNullable<RecurrenceException["override"]>,
): ExpandedCalendarEvent {
  return {
    ...base,
    title: override.title ?? base.title,
    notes: override.notes ?? base.notes,
    startAt: override.startAt ?? base.startAt,
    endAt: override.endAt ?? base.endAt,
    allDay: override.allDay ?? base.allDay,
    color: override.color ?? base.color,
    activityTypeKey: override.activityTypeKey ?? base.activityTypeKey,
  };
}

function findRecurrenceException(
  event: CalendarEvent,
  occurrenceDate: string,
): RecurrenceException | undefined {
  return event.recurrenceExceptions?.find((item) => item.occurrenceDate === occurrenceDate);
}

function formatOccurrenceDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function cloneOccurrence(
  event: CalendarEvent,
  start: Date,
  end: Date,
  index: number,
  occurrenceDate: string,
): ExpandedCalendarEvent {
  const pad = (n: number) => String(n).padStart(2, "0");
  const startAt = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endAt = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;

  return {
    occurrenceId: `${event.id}:${index}`,
    sourceEventId: event.id,
    occurrenceDate,
    title: event.title,
    notes: event.notes,
    startAt,
    endAt,
    allDay: event.allDay,
    color: event.color,
    isRecurringInstance: true,
    googleEventId: event.googleEventId,
    googleCalendarId: event.googleCalendarId,
    activityTypeKey: event.activityTypeKey,
    attendedFromShared: event.attendedFromShared,
  };
}

function isWithinRange(date: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return date <= rangeEnd && date >= rangeStart;
}

function matchesWeekday(date: Date, weekdays?: number[]): boolean {
  if (!weekdays || weekdays.length === 0) {
    return true;
  }
  return weekdays.includes(date.getDay());
}

function shouldStop(recurrence: RecurrenceRule, index: number, cursor: Date): boolean {
  if (recurrence.neverEnds) {
    return false;
  }
  if (recurrence.count !== undefined && index >= recurrence.count) {
    return true;
  }
  if (recurrence.endDate) {
    const end = new Date(`${recurrence.endDate}T23:59:59`);
    return cursor > end;
  }
  return index >= MAX_OCCURRENCES;
}

function resolveRecurrenceFrequency(recurrence: RecurrenceRule): "daily" | "weekly" | "monthly" | "none" {
  if (recurrence.frequency === "custom") {
    return recurrence.customUnit ?? "weekly";
  }
  if (recurrence.frequency === "none") {
    return "none";
  }
  return recurrence.frequency;
}

function advanceCursor(cursor: Date, recurrence: RecurrenceRule): Date {
  const next = new Date(cursor);
  const interval = Math.max(1, recurrence.interval);
  const frequency = resolveRecurrenceFrequency(recurrence);

  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + interval);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * interval);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + interval);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }
  return next;
}

export function expandEventOccurrences(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedCalendarEvent[] {
  if (event.recurrence.frequency === "none") {
    const start = parseLocalDateTime(event.startAt);
    const end = parseLocalDateTime(event.endAt);
    if (end < rangeStart || start > rangeEnd) {
      return [];
    }
    return [
      {
        occurrenceId: `${event.id}:0`,
        sourceEventId: event.id,
        occurrenceDate: event.startAt.slice(0, 10),
        title: event.title,
        notes: event.notes,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        color: event.color,
        isRecurringInstance: false,
        googleEventId: event.googleEventId,
        googleCalendarId: event.googleCalendarId,
        activityTypeKey: event.activityTypeKey,
        attendedFromShared: event.attendedFromShared,
      },
    ];
  }

  const start = parseLocalDateTime(event.startAt);
  const end = parseLocalDateTime(event.endAt);
  const durationMs = end.getTime() - start.getTime();

  const results: ExpandedCalendarEvent[] = [];
  let cursor = new Date(start);
  let index = 0;

  while (!shouldStop(event.recurrence, index, cursor)) {
    const occurrenceDate = formatOccurrenceDate(cursor);
    const exception = findRecurrenceException(event, occurrenceDate);

    if (!exception?.deleted) {
      const occurrenceEnd = new Date(cursor.getTime() + durationMs);

      if (matchesWeekday(cursor, event.recurrence.weekdays) && isWithinRange(cursor, rangeStart, rangeEnd)) {
        let occurrence = cloneOccurrence(event, cursor, occurrenceEnd, index, occurrenceDate);
        if (exception?.override) {
          occurrence = applyOverrideToOccurrence(occurrence, exception.override);
        }
        results.push(occurrence);
      }
    }

    if (cursor > rangeEnd && index > 0) {
      break;
    }

    if (!event.recurrence.neverEnds && index >= MAX_OCCURRENCES - 1) {
      break;
    }

    cursor = advanceCursor(cursor, event.recurrence);
    index += 1;
  }

  return results;
}

function dedupeExpandedEvents(events: ExpandedCalendarEvent[]): ExpandedCalendarEvent[] {
  const seen = new Map<string, ExpandedCalendarEvent>();
  for (const event of events) {
    const key = `${event.sourceEventId}:${event.startAt}:${event.endAt}`;
    if (!seen.has(key)) {
      seen.set(key, event);
    }
  }
  return [...seen.values()];
}

export function expandEventsForDay(
  events: CalendarEvent[],
  dayDate: string,
): ExpandedCalendarEvent[] {
  const rangeStart = new Date(`${dayDate}T00:00:00`);
  const rangeEnd = new Date(`${dayDate}T23:59:59`);

  return dedupeExpandedEvents(
    events
      .flatMap((event) => expandEventOccurrences(event, rangeStart, rangeEnd))
      .filter((item) => item.startAt.slice(0, 10) === dayDate || item.endAt.slice(0, 10) === dayDate),
  ).sort((left, right) => left.startAt.localeCompare(right.startAt));
}

export function expandEventsForRange(
  events: CalendarEvent[],
  startDate: string,
  endDate: string,
): ExpandedCalendarEvent[] {
  const rangeStart = new Date(`${startDate}T00:00:00`);
  const rangeEnd = new Date(`${endDate}T23:59:59`);

  return dedupeExpandedEvents(
    events.flatMap((event) => expandEventOccurrences(event, rangeStart, rangeEnd)),
  ).sort((left, right) => left.startAt.localeCompare(right.startAt));
}

export function defaultRecurrence(): RecurrenceRule {
  return { frequency: "none", interval: 1 };
}

export function getWeekDates(anchorDate: string): string[] {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const day = anchor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return formatDateOnly(date);
  });
}

export function getMonthGridDates(anchorDate: string): string[] {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return formatDateOnly(date);
  });
}

export { addDays };
