import {
  CALENDAR_OTHER_ACTIVITY_KEY,
  getCalendarActivityTypeGroup,
  getCalendarActivityTypeLabel,
} from "@/lib/calendar/calendar-activity-types";
import { parseLocalDateTime } from "@/lib/calendar/time-grid";
import { expandEventsForRange } from "@/lib/calendar/recurrence";
import type { CalendarEvent, CalendarEventColor, ExpandedCalendarEvent } from "@/types/calendar-event";
import { isSharedGoogleCalendarId } from "@/lib/calendar/shared-calendars";

export interface CalendarStatsQuery {
  startDate: string;
  endDate: string;
  keyword?: string;
}

export interface CalendarStatsResult {
  totalOccurrences: number;
  totalHours: number;
  allDayCount: number;
  recurringInstanceCount: number;
  googleSyncedCount: number;
  uniqueSourceEvents: number;
  byColor: Record<CalendarEventColor, number>;
  byActivityType: Array<{ key: string; label: string; group: "daily" | "meeting" | "other"; count: number }>;
  attendedSharedCount: number;
  byDay: Array<{ date: string; count: number }>;
  topTitles: Array<{ title: string; count: number }>;
  events: ExpandedCalendarEvent[];
}

const COLOR_KEYS: CalendarEventColor[] = [
  "blue",
  "green",
  "orange",
  "red",
  "purple",
  "teal",
  "gray",
];

function emptyColorCounts(): Record<CalendarEventColor, number> {
  return Object.fromEntries(COLOR_KEYS.map((key) => [key, 0])) as Record<
    CalendarEventColor,
    number
  >;
}

function eventDurationHours(event: ExpandedCalendarEvent): number {
  if (event.allDay) {
    return 0;
  }
  const start = parseLocalDateTime(event.startAt);
  const end = parseLocalDateTime(event.endAt);
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

function matchesKeyword(event: ExpandedCalendarEvent, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    event.title.toLowerCase().includes(normalized) ||
    (event.notes?.toLowerCase().includes(normalized) ?? false)
  );
}

export function buildCalendarStats(
  events: CalendarEvent[],
  query: CalendarStatsQuery,
): CalendarStatsResult {
  const statsEvents = events.filter(
    (event) => !isSharedGoogleCalendarId(event.googleCalendarId) || event.attendedFromShared,
  );
  const expanded = expandEventsForRange(statsEvents, query.startDate, query.endDate).filter((event) =>
    matchesKeyword(event, query.keyword ?? ""),
  );

  const byColor = emptyColorCounts();
  const activityCountMap = new Map<string, number>();
  const dayCountMap = new Map<string, number>();
  const titleCountMap = new Map<string, number>();
  const sourceIds = new Set<string>();

  let totalHours = 0;
  let allDayCount = 0;
  let recurringInstanceCount = 0;
  let googleSyncedCount = 0;
  let attendedSharedCount = 0;

  for (const event of expanded) {
    byColor[event.color] += 1;
    sourceIds.add(event.sourceEventId);

    const activityKey = event.activityTypeKey ?? CALENDAR_OTHER_ACTIVITY_KEY;
    activityCountMap.set(activityKey, (activityCountMap.get(activityKey) ?? 0) + 1);

    if (event.attendedFromShared) {
      attendedSharedCount += 1;
    }

    const dayKey = event.startAt.slice(0, 10);
    dayCountMap.set(dayKey, (dayCountMap.get(dayKey) ?? 0) + 1);

    titleCountMap.set(event.title, (titleCountMap.get(event.title) ?? 0) + 1);

    if (event.allDay) {
      allDayCount += 1;
    } else {
      totalHours += eventDurationHours(event);
    }

    if (event.isRecurringInstance) {
      recurringInstanceCount += 1;
    }

    if (event.googleEventId) {
      googleSyncedCount += 1;
    }
  }

  const byDay = [...dayCountMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const topTitles = [...titleCountMap.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  const byActivityType = [...activityCountMap.entries()]
    .map(([key, count]) => ({
      key,
      label: getCalendarActivityTypeLabel(key),
      group: getCalendarActivityTypeGroup(key),
      count,
    }))
    .sort((left, right) => right.count - left.count);

  return {
    totalOccurrences: expanded.length,
    totalHours: Math.round(totalHours * 10) / 10,
    allDayCount,
    recurringInstanceCount,
    googleSyncedCount,
    uniqueSourceEvents: sourceIds.size,
    byColor,
    byActivityType,
    attendedSharedCount,
    byDay,
    topTitles,
    events: expanded,
  };
}

export function getMonthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function getMonthEnd(date: string): string {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

export function shiftMonth(date: string, delta: number): string {
  const anchor = new Date(`${date.slice(0, 7)}-01T12:00:00`);
  anchor.setMonth(anchor.getMonth() + delta);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${anchor.getFullYear()}-${pad(anchor.getMonth() + 1)}-01`;
}

export function shiftWeek(date: string, deltaWeeks: number): string {
  const anchor = new Date(`${date}T12:00:00`);
  anchor.setDate(anchor.getDate() + deltaWeeks * 7);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${anchor.getFullYear()}-${pad(anchor.getMonth() + 1)}-${pad(anchor.getDate())}`;
}
