import { APP_TIMEZONE } from "@/lib/config/app-config";
import {
  MEMO_REMINDER_TYPES,
  type MemoReminderType,
  type MemoUpsertInput,
  type MemoWeekday,
} from "@/lib/memos/types";

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Parts of `instant` in Asia/Taipei. */
export function taipeiParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: MemoWeekday;
  date: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(instant);

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayShort = read("weekday");
  const weekdayMap: Record<string, MemoWeekday> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  let hour = Number(read("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(read("minute"));

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: weekdayMap[weekdayShort] ?? 1,
    date: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

/** Convert Asia/Taipei wall clock → UTC ISO string. */
export function taipeiWallToUtcIso(date: string, time: string): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
    return null;
  }
  const ms = Date.parse(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

function addCalendarDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T12:00:00+08:00`) + days * 24 * 60 * 60 * 1000;
  return taipeiParts(new Date(ms)).date;
}

function daysUntilWeekday(fromWeekday: MemoWeekday, targetWeekday: MemoWeekday): number {
  return (targetWeekday - fromWeekday + 7) % 7;
}

export function isValidReminderTime(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!TIME_RE.test(value)) return false;
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3, 5));
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function isValidReminderDate(value: string | null | undefined): boolean {
  return Boolean(value && DATE_RE.test(value));
}

export function isValidWeekday(value: number | null | undefined): value is MemoWeekday {
  return typeof value === "number" && value >= 1 && value <= 7;
}

/**
 * Compute the next reminder fire time (UTC ISO) from reminder settings.
 * `from` is exclusive for recurring types when advancing after a send
 * (pass the previous fire instant + 1ms, or `now` for create/edit).
 */
export function computeNextReminderAt(
  input: Pick<
    MemoUpsertInput,
    "reminderType" | "reminderTime" | "reminderWeekday" | "reminderDate"
  > & { completed?: boolean },
  from: Date = new Date(),
): string | null {
  if (input.completed) {
    return null;
  }

  const type = input.reminderType;
  if (type === MEMO_REMINDER_TYPES.NONE) {
    return null;
  }

  const time = input.reminderTime ?? null;
  if (!isValidReminderTime(time)) {
    return null;
  }

  const parts = taipeiParts(from);

  if (type === MEMO_REMINDER_TYPES.DAILY) {
    const todayCandidate = taipeiWallToUtcIso(parts.date, time!);
    if (!todayCandidate) return null;
    if (Date.parse(todayCandidate) > from.getTime()) {
      return todayCandidate;
    }
    return taipeiWallToUtcIso(addCalendarDays(parts.date, 1), time!);
  }

  if (type === MEMO_REMINDER_TYPES.WEEKLY) {
    if (!isValidWeekday(input.reminderWeekday)) {
      return null;
    }
    let delta = daysUntilWeekday(parts.weekday, input.reminderWeekday);
    let candidateDate = addCalendarDays(parts.date, delta);
    let candidate = taipeiWallToUtcIso(candidateDate, time!);
    if (!candidate) return null;
    if (Date.parse(candidate) <= from.getTime()) {
      candidateDate = addCalendarDays(candidateDate, 7);
      candidate = taipeiWallToUtcIso(candidateDate, time!);
    }
    return candidate;
  }

  if (type === MEMO_REMINDER_TYPES.SPECIFIC_DATE) {
    if (!isValidReminderDate(input.reminderDate)) {
      return null;
    }
    const candidate = taipeiWallToUtcIso(input.reminderDate!, time!);
    if (!candidate) return null;
    if (Date.parse(candidate) <= from.getTime()) {
      return null;
    }
    return candidate;
  }

  return null;
}

/** After a successful notification, advance or clear next_reminder_at. */
export function advanceNextReminderAfterNotify(
  reminderType: MemoReminderType,
  reminderTime: string | null,
  reminderWeekday: MemoWeekday | null,
  reminderDate: string | null,
  firedAtIso: string,
): string | null {
  if (
    reminderType === MEMO_REMINDER_TYPES.NONE ||
    reminderType === MEMO_REMINDER_TYPES.SPECIFIC_DATE
  ) {
    return null;
  }

  const firedAt = new Date(firedAtIso);
  // Exclusive of the fire instant so we always land on the next occurrence.
  const from = new Date(firedAt.getTime() + 1);
  return computeNextReminderAt(
    {
      reminderType,
      reminderTime,
      reminderWeekday,
      reminderDate,
      completed: false,
    },
    from,
  );
}
