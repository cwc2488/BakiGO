import {
  getCalendarActivityTypeLabel,
  getCalendarActivityTypeGroup,
} from "@/lib/calendar/calendar-activity-types";
import { expandEventsForDay } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/types/calendar-event";

export interface CalendarDayPlanItem {
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  activityTypeKey?: string;
  activityLabel: string;
  activityGroup: "daily" | "meeting" | "other";
  attendedFromShared?: boolean;
}

export interface CalendarDayPlanSummary {
  date: string;
  totalCount: number;
  meetingCount: number;
  dailyCount: number;
  attendedCount: number;
  items: CalendarDayPlanItem[];
}

export function buildCalendarDayPlan(events: CalendarEvent[], date: string): CalendarDayPlanSummary {
  const expanded = expandEventsForDay(events, date);
  const items: CalendarDayPlanItem[] = expanded.map((event) => ({
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    activityTypeKey: event.activityTypeKey,
    activityLabel: getCalendarActivityTypeLabel(event.activityTypeKey),
    activityGroup: getCalendarActivityTypeGroup(event.activityTypeKey),
    attendedFromShared: event.attendedFromShared,
  }));

  return {
    date,
    totalCount: items.length,
    meetingCount: items.filter((item) => item.activityGroup === "meeting").length,
    dailyCount: items.filter((item) => item.activityGroup === "daily").length,
    attendedCount: items.filter((item) => item.attendedFromShared).length,
    items,
  };
}
