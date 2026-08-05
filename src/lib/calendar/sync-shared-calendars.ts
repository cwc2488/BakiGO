import { addDays } from "@/lib/calendar/recurrence";
import { SHARED_GOOGLE_CALENDARS } from "@/lib/calendar/shared-calendars";
import {
  isSharedCalendarCacheFresh,
  loadSharedCalendarEvents,
  saveSharedCalendarCache,
  sharedApiEventsToCalendarEvents,
  type SharedCalendarStoredEvent,
} from "@/lib/calendar/shared-calendar-storage";
import { getTodayDateString } from "@/lib/calendar/time-grid";
import type { CalendarEvent, CalendarEventColor } from "@/types/calendar-event";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

interface SharedCalendarApiEvent {
  uid: string;
  title: string;
  notes?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  calendarId: string;
  calendarName: string;
  color: CalendarEventColor;
}

/** 每日同步一次即可涵蓋一般瀏覽範圍 */
export const SHARED_CALENDAR_SYNC_RANGE_DAYS = 180;

export function getSharedCalendarSyncRange(referenceDate = getTodayDateString()): {
  rangeStart: string;
  rangeEnd: string;
} {
  return {
    rangeStart: addDays(referenceDate, -SHARED_CALENDAR_SYNC_RANGE_DAYS),
    rangeEnd: addDays(referenceDate, SHARED_CALENDAR_SYNC_RANGE_DAYS),
  };
}

export function loadCachedSharedCalendarEvents(
  storage: StorageAdapter,
  memberId: string,
): CalendarEvent[] {
  if (!isSharedCalendarCacheFresh(storage, memberId)) {
    return [];
  }
  return loadSharedCalendarEvents(storage);
}

export async function syncSharedGoogleCalendars(
  storage: StorageAdapter,
  memberId: string,
  rangeStart: string,
  rangeEnd: string,
  options?: { force?: boolean },
): Promise<{ count: number; events: CalendarEvent[]; fromCache: boolean }> {
  if (!options?.force && isSharedCalendarCacheFresh(storage, memberId)) {
    const cached = loadSharedCalendarEvents(storage);
    return { count: cached.length, events: cached, fromCache: true };
  }

  const response = await fetch(
    `/api/calendar/shared/events?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}&v=4`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "無法同步共用行事曆");
  }

  const payload = (await response.json()) as {
    calendars: Array<{
      calendarId: string;
      calendarName: string;
      events: SharedCalendarApiEvent[];
    }>;
  };

  const apiEvents: SharedCalendarStoredEvent[] = payload.calendars.flatMap((calendar) =>
    calendar.events.map((event) => ({
      uid: event.uid,
      title: event.title,
      notes: event.notes,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
      color: event.color,
      calendarId: event.calendarId,
    })),
  );

  const events = sharedApiEventsToCalendarEvents(memberId, apiEvents);
  saveSharedCalendarCache(storage, events, {
    syncedDate: getTodayDateString(),
    rangeStart,
    rangeEnd,
    memberId,
    syncedAt: new Date().toISOString(),
  });

  return { count: events.length, events, fromCache: false };
}

export function getSharedCalendarIds(): Set<string> {
  return new Set(SHARED_GOOGLE_CALENDARS.map((calendar) => calendar.id));
}
