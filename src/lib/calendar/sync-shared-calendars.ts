import { SHARED_GOOGLE_CALENDARS } from "@/lib/calendar/shared-calendars";
import {
  resetSharedCalendarCache,
  sharedApiEventsToCalendarEvents,
  type SharedCalendarStoredEvent,
} from "@/lib/calendar/shared-calendar-storage";
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

export async function syncSharedGoogleCalendars(
  storage: StorageAdapter,
  memberId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ count: number; events: CalendarEvent[] }> {
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
  resetSharedCalendarCache(storage);

  return { count: events.length, events };
}

export function getSharedCalendarIds(): Set<string> {
  return new Set(SHARED_GOOGLE_CALENDARS.map((calendar) => calendar.id));
}
