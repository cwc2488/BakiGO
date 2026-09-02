import type { CalendarEvent } from "@/types/calendar-event";
import {
  CALENDAR_EVENT_SOURCE,
  CALENDAR_EVENT_SOURCE_LABEL,
  type CalendarEventSource,
} from "@/types/calendar-event-participant";
import type { EntityId } from "@/types";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { getCalendarCategoryLabel, resolveCalendarCategoryKey } from "./calendar-activity-types";
import { eventHasParticipant } from "./calendar-event-participants";
import {
  hasAllianceParticipant,
  listAllianceEventIdsForCustomer,
} from "./alliance-event-participants";
import { isPersonalCalendarEvent } from "./shared-calendar-storage";
import { addDays, getTodayDateString, formatChineseMonthDay } from "./time-grid";

export type NextActivitySourceFilter = "all" | CalendarEventSource;

export type NextActivityPickerItem = {
  eventId: EntityId;
  eventSource: CalendarEventSource;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  activityTypeKey?: string;
  categoryLabel: string;
  dateLabel: string;
  timeLabel: string;
  dateKey: string;
  sourceLabel: string;
};

export type NextActivityDateGroup = {
  dateKey: string;
  heading: string;
  items: NextActivityPickerItem[];
};

function formatDateLabel(startAt: string): string {
  const date = startAt.slice(0, 10);
  const [, m, d] = date.split("-");
  if (!m || !d) return date;
  return `${Number(m)}/${Number(d)}`;
}

function formatTimeLabel(startAt: string, endAt: string, allDay: boolean): string {
  if (allDay) return "整天";
  const start = startAt.slice(11, 16);
  const end = endAt.slice(11, 16);
  if (!start) return "—";
  return end ? `${start}–${end}` : start;
}

function toPickerItem(
  event: CalendarEvent,
  eventSource: CalendarEventSource,
): NextActivityPickerItem {
  const categoryKey = resolveCalendarCategoryKey(event.activityTypeKey);
  return {
    eventId: event.id,
    eventSource,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    activityTypeKey: event.activityTypeKey,
    categoryLabel: getCalendarCategoryLabel(categoryKey),
    dateLabel: formatDateLabel(event.startAt),
    timeLabel: formatTimeLabel(event.startAt, event.endAt, event.allDay),
    dateKey: event.startAt.slice(0, 10),
    sourceLabel: CALENDAR_EVENT_SOURCE_LABEL[eventSource],
  };
}

function isUpcoming(event: CalendarEvent, nowIso: string): boolean {
  const now = nowIso.slice(0, 16);
  return event.endAt >= now || event.startAt >= now;
}

export function dateGroupHeading(dateKey: string, today = getTodayDateString()): string {
  if (dateKey === today) return "今天";
  if (dateKey === addDays(today, 1)) return "明天";
  return formatChineseMonthDay(dateKey);
}

export function groupNextActivityItems(items: NextActivityPickerItem[]): NextActivityDateGroup[] {
  const byDate = new Map<string, NextActivityPickerItem[]>();
  for (const item of items) {
    const list = byDate.get(item.dateKey) ?? [];
    list.push(item);
    byDate.set(item.dateKey, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, groupItems]) => ({
      dateKey,
      heading: dateGroupHeading(dateKey),
      items: groupItems.sort((a, b) => a.startAt.localeCompare(b.startAt)),
    }));
}

export function matchesNextActivitySearch(item: NextActivityPickerItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    item.categoryLabel.toLowerCase().includes(q) ||
    item.sourceLabel.toLowerCase().includes(q) ||
    item.dateLabel.includes(q)
  );
}

export function filterNextActivityItems(
  items: NextActivityPickerItem[],
  input: { query: string; source: NextActivitySourceFilter },
): NextActivityPickerItem[] {
  return items.filter((item) => {
    if (input.source !== "all" && item.eventSource !== input.source) return false;
    return matchesNextActivitySearch(item, input.query);
  });
}

/**
 * Upcoming events the customer is not yet linked to.
 * Personal events come from the coach calendar blob.
 * Alliance shared events come from the iCal cache — never copied into personal calendar.
 */
export function listLinkableNextActivityItems(input: {
  personalEvents: CalendarEvent[];
  sharedEvents: CalendarEvent[];
  storage: StorageAdapter;
  ownerMemberId: EntityId;
  customerId: EntityId;
  nowIso: string;
}): NextActivityPickerItem[] {
  const personal = input.personalEvents
    .filter(isPersonalCalendarEvent)
    .filter((event) => !event.attendedFromShared)
    .filter((event) => isUpcoming(event, input.nowIso))
    .filter((event) => !eventHasParticipant(event, input.customerId))
    .map((event) => toPickerItem(event, CALENDAR_EVENT_SOURCE.PERSONAL));

  const shared = input.sharedEvents
    .filter((event) => !isPersonalCalendarEvent(event) || event.id.startsWith("shared:"))
    .filter((event) => isUpcoming(event, input.nowIso))
    .filter(
      (event) =>
        !hasAllianceParticipant(input.storage, input.ownerMemberId, event.id, input.customerId),
    )
    .map((event) => toPickerItem(event, CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED));

  return [...personal, ...shared].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function listLinkedNextActivityItems(input: {
  personalEvents: CalendarEvent[];
  sharedEvents: CalendarEvent[];
  storage: StorageAdapter;
  ownerMemberId: EntityId;
  customerId: EntityId;
  nowIso: string;
}): NextActivityPickerItem[] {
  const personal = input.personalEvents
    .filter(isPersonalCalendarEvent)
    .filter((event) => !event.attendedFromShared)
    .filter((event) => eventHasParticipant(event, input.customerId))
    .filter((event) => isUpcoming(event, input.nowIso))
    .map((event) => toPickerItem(event, CALENDAR_EVENT_SOURCE.PERSONAL));

  const linkedSharedIds = new Set(
    listAllianceEventIdsForCustomer(input.storage, input.ownerMemberId, input.customerId),
  );
  const shared = input.sharedEvents
    .filter((event) => linkedSharedIds.has(event.id))
    .filter((event) => isUpcoming(event, input.nowIso))
    .map((event) => toPickerItem(event, CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED));

  return [...personal, ...shared].sort((a, b) => a.startAt.localeCompare(b.startAt));
}
