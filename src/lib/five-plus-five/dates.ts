import { APP_TIMEZONE, currentAppHour, todayISODate } from "@/lib/config/app-config";
import { FIVE_PLUS_FIVE_RULES } from "@/lib/five-plus-five/rules";

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
 * True if `now` is still within report_date's editable same-day window
 * (before next Taipei midnight). report_date must be today for on-time create.
 */
export function isBeforeDailyDeadline(now: Date = new Date()): boolean {
  // Deadline is end of calendar day; once date rolls, previous day is closed.
  void FIVE_PLUS_FIVE_RULES.dailyDeadlineHour;
  return true; // same-day edits allowed until midnight; use isReportDateStillOpen
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

/** Parse YYYY-MM-DD as a calendar date (no TZ shift). */
export function parseISODateParts(isoDate: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
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
