import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

/**
 * Production calendar historically starts weeks on Monday.
 * Keep that as the fallback so existing users see no layout jump.
 */
export const CALENDAR_WEEK_STARTS = {
  MONDAY: "monday",
  SUNDAY: "sunday",
} as const;

export type CalendarWeekStart =
  (typeof CALENDAR_WEEK_STARTS)[keyof typeof CALENDAR_WEEK_STARTS];

export const DEFAULT_CALENDAR_WEEK_START: CalendarWeekStart = CALENDAR_WEEK_STARTS.MONDAY;

/** JS Date.getDay() value for the first column of the calendar grid. */
export function weekStartToJsDay(weekStart: CalendarWeekStart): 0 | 1 {
  return weekStart === CALENDAR_WEEK_STARTS.SUNDAY ? 0 : 1;
}

export function isCalendarWeekStart(value: string | null | undefined): value is CalendarWeekStart {
  return value === CALENDAR_WEEK_STARTS.MONDAY || value === CALENDAR_WEEK_STARTS.SUNDAY;
}

export function loadCalendarWeekStart(storage: StorageAdapter): CalendarWeekStart {
  const raw = storage.getItem(STORAGE_KEYS.calendarWeekStart);
  if (isCalendarWeekStart(raw)) {
    return raw;
  }
  return DEFAULT_CALENDAR_WEEK_START;
}

export function saveCalendarWeekStart(storage: StorageAdapter, weekStart: CalendarWeekStart): void {
  storage.setItem(STORAGE_KEYS.calendarWeekStart, weekStart);
}

/** Short weekday labels for a Mon-first or Sun-first 7-column header. */
export function getCalendarWeekdayLabels(weekStart: CalendarWeekStart): string[] {
  return weekStart === CALENDAR_WEEK_STARTS.SUNDAY
    ? ["日", "一", "二", "三", "四", "五", "六"]
    : ["一", "二", "三", "四", "五", "六", "日"];
}
