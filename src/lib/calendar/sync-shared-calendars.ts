import { addDays } from "@/lib/calendar/recurrence";
import { SHARED_GOOGLE_CALENDARS } from "@/lib/calendar/shared-calendars";
import {
  hydrateSharedCalendarCache,
  isSharedCalendarCacheFresh,
  loadSharedCalendarEvents,
  saveSharedCalendarCache,
  sharedApiEventsToCalendarEvents,
  type SharedCalendarStoredEvent,
} from "@/lib/calendar/shared-calendar-storage";
import {
  getSharedCalendarMemoryCache,
  isSharedCalendarSnapshotFresh,
} from "@/lib/calendar/shared-calendar-session-cache";
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

type SharedCalendarSyncResult = {
  count: number;
  events: CalendarEvent[];
  fromCache: boolean;
};

let refreshInFlight: Promise<SharedCalendarSyncResult> | null = null;
let refreshInFlightKey: string | null = null;

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
  return loadSharedCalendarEvents(storage, memberId);
}

async function fetchSharedGoogleCalendarEvents(
  storage: StorageAdapter,
  memberId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<SharedCalendarSyncResult> {
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

/**
 * Stale-while-revalidate shared calendar sync.
 * - Fresh memory/IDB cache → return immediately, no API
 * - Stale/missing → single in-flight API refresh (deduped)
 * - API failure → keep existing cache; only throw when nothing is cached
 */
export async function syncSharedGoogleCalendars(
  storage: StorageAdapter,
  memberId: string,
  rangeStart: string,
  rangeEnd: string,
  options?: { force?: boolean },
): Promise<SharedCalendarSyncResult> {
  const hydrated = await hydrateSharedCalendarCache(storage, memberId);
  const cached = hydrated ?? getSharedCalendarMemoryCache(memberId);
  const force = options?.force === true;

  if (!force && cached && isSharedCalendarSnapshotFresh(cached)) {
    return { count: cached.events.length, events: cached.events.slice(), fromCache: true };
  }

  const flightKey = `${memberId}|${rangeStart}|${rangeEnd}|${force ? "force" : "soft"}`;
  if (refreshInFlight && refreshInFlightKey === flightKey) {
    return refreshInFlight;
  }

  // Soft refresh while stale cache exists: still dedupe concurrent mounts.
  if (!force && refreshInFlight) {
    return refreshInFlight;
  }

  const pending = (async (): Promise<SharedCalendarSyncResult> => {
    try {
      return await fetchSharedGoogleCalendarEvents(storage, memberId, rangeStart, rangeEnd);
    } catch (error) {
      const fallback = getSharedCalendarMemoryCache(memberId) ?? cached;
      if (fallback && fallback.events.length > 0) {
        // Refresh failed ≠ wipe cache.
        console.warn("[calendar] shared calendar refresh failed — keeping cached events", error);
        return {
          count: fallback.events.length,
          events: fallback.events.slice(),
          fromCache: true,
        };
      }
      throw error;
    }
  })();

  refreshInFlight = pending;
  refreshInFlightKey = flightKey;
  try {
    return await pending;
  } finally {
    if (refreshInFlight === pending) {
      refreshInFlight = null;
      refreshInFlightKey = null;
    }
  }
}

export function getSharedCalendarIds(): Set<string> {
  return new Set(SHARED_GOOGLE_CALENDARS.map((calendar) => calendar.id));
}

/** Test helper — clear in-flight dedupe state. */
export function __resetSharedCalendarSyncFlightForTests(): void {
  refreshInFlight = null;
  refreshInFlightKey = null;
}
