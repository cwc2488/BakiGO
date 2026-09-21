import { APP_TIMEZONE, currentAppHour, todayISODate } from "@/lib/config/app-config";

export const FIVE_PLUS_FIVE_TIMEZONE = APP_TIMEZONE;

/** YYYY-MM-DD in Asia/Taipei. */
export function fivePlusFiveToday(now: Date = new Date()): string {
  return todayISODate(now);
}

/** Hour 0–23 in Asia/Taipei. */
export function fivePlusFiveHour(now: Date = new Date()): number {
  return currentAppHour(now);
}

/**
 * A report_date is "still open" for first on-time submit when it equals today
 * in Asia/Taipei (00:00–23:59 inclusive until the date flips).
 */
export function isReportDateStillOpen(reportDate: string, now: Date = new Date()): boolean {
  return reportDate === fivePlusFiveToday(now);
}

/** First submit on today before midnight → on time. Past dates → late / 補登. */
export function computeSubmittedOnTime(reportDate: string, now: Date = new Date()): boolean {
  return isReportDateStillOpen(reportDate, now);
}

/** Parse YYYY-MM-DD as a calendar date (no TZ shift). Rejects invalid calendars. */
export function isValidISOCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reconstruct via UTC and require round-trip (rejects 2026-02-31, 2026-00-00, etc.)
  const utc = new Date(Date.UTC(y, m - 1, d));
  return (
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() + 1 === m &&
    utc.getUTCDate() === d
  );
}

export function parseISODateParts(isoDate: string): { y: number; m: number; d: number } {
  if (!isValidISOCalendarDate(isoDate)) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return {
    y: Number(isoDate.slice(0, 4)),
    m: Number(isoDate.slice(5, 7)),
    d: Number(isoDate.slice(8, 10)),
  };
}

export function formatISODate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Add calendar days to an ISO date (pure calendar arithmetic). */
export function addCalendarDays(isoDate: string, deltaDays: number): string {
  const { y, m, d } = parseISODateParts(isoDate);
  const utc = Date.UTC(y, m - 1, d + deltaDays);
  const date = new Date(utc);
  return formatISODate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Day of week for ISO date: 0=Sun … 6=Sat (calendar, not local JS Date). */
export function isoDateWeekday(isoDate: string): number {
  const { y, m, d } = parseISODateParts(isoDate);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Business week containing `isoDate`: Monday–Sunday Asia/Taipei calendar.
 * Independent of Calendar personal week-start preference.
 */
export function getBusinessWeekRange(isoDate: string): { start: string; end: string } {
  const weekday = isoDateWeekday(isoDate); // 0 Sun … 6 Sat
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const start = addCalendarDays(isoDate, -daysFromMonday);
  const end = addCalendarDays(start, 6);
  return { start, end };
}

export function getMonthRange(isoDate: string): { start: string; end: string } {
  const { y, m } = parseISODateParts(isoDate);
  const start = formatISODate(y, m, 1);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = formatISODate(y, m, lastDay);
  return { start, end };
}

/** Days from month start through `isoDate` inclusive (for on-time rate denominator). */
export function daysElapsedInMonthThrough(isoDate: string): number {
  return parseISODateParts(isoDate).d;
}

/** Display like 9/21 (no leading zero on month/day). */
export function formatShortDisplayDate(isoDate: string): string {
  const { m, d } = parseISODateParts(isoDate);
  return `${m}/${d}`;
}

/** Instant when Taipei calendar day `isoDate` starts (00:00+08:00). */
export function taipeiDayStartMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00+08:00`);
}

/** Instant just after Taipei calendar day ends (next day 00:00+08:00). */
export function taipeiDayEndExclusiveMs(isoDate: string): number {
  return taipeiDayStartMs(addCalendarDays(isoDate, 1));
}

/**
 * True if `now` is still before the exclusive end of `isoDate`
 * (i.e. within 00:00–23:59:59.999 Asia/Taipei of that date).
 */
export function isWithinTaipeiCalendarDay(isoDate: string, now: Date = new Date()): boolean {
  const ms = now.getTime();
  return ms >= taipeiDayStartMs(isoDate) && ms < taipeiDayEndExclusiveMs(isoDate);
}

export function listISODatesInclusive(start: string, end: string): string[] {
  if (start > end) return [];
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return out;
}
