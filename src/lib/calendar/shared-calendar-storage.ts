import { defaultRecurrence } from "@/lib/calendar/recurrence";
import { inferCalendarActivityTypeFromTitle } from "@/lib/calendar/calendar-activity-types";
import { isSharedGoogleCalendarId, getSharedCalendarEventColor } from "@/lib/calendar/shared-calendars";
import type { CalendarEvent, CalendarEventColor } from "@/types/calendar-event";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";

/** 時區解析或儲存結構變更時遞增，強制清除舊快取 */
export const SHARED_CALENDAR_DATA_VERSION = 4;

function parseEvents(raw: string | null): CalendarEvent[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as CalendarEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadSharedCalendarEvents(storage: StorageAdapter): CalendarEvent[] {
  return parseEvents(storage.getItem(STORAGE_KEYS.sharedCalendarEvents));
}

export function saveSharedCalendarEvents(storage: StorageAdapter, events: CalendarEvent[]): void {
  storage.setItem(STORAGE_KEYS.sharedCalendarEvents, JSON.stringify(events));
}

export function clearSharedCalendarEvents(storage: StorageAdapter): void {
  storage.removeItem(STORAGE_KEYS.sharedCalendarEvents);
}

export function migrateSharedCalendarStorageIfNeeded(storage: StorageAdapter): boolean {
  const current = storage.getItem(STORAGE_KEYS.sharedCalendarDataVersion);
  if (current === String(SHARED_CALENDAR_DATA_VERSION)) {
    return false;
  }
  clearSharedCalendarEvents(storage);
  storage.setItem(STORAGE_KEYS.sharedCalendarDataVersion, String(SHARED_CALENDAR_DATA_VERSION));
  return true;
}

/** 共用行程不再快取於 localStorage，僅清除殘留 */
export function resetSharedCalendarCache(storage: StorageAdapter): void {
  clearSharedCalendarEvents(storage);
  storage.setItem(STORAGE_KEYS.sharedCalendarDataVersion, String(SHARED_CALENDAR_DATA_VERSION));
}

export function markSharedCalendarStorageFresh(storage: StorageAdapter): void {
  storage.setItem(STORAGE_KEYS.sharedCalendarDataVersion, String(SHARED_CALENDAR_DATA_VERSION));
}

export interface SharedCalendarStoredEvent {
  uid: string;
  title: string;
  notes?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: CalendarEventColor;
  calendarId: string;
}

export function sharedApiEventsToCalendarEvents(
  memberId: string,
  events: SharedCalendarStoredEvent[],
): CalendarEvent[] {
  const now = new Date().toISOString();
  return events.map((event) => ({
    id: `shared:${event.calendarId}:${event.uid}`,
    createdAt: now,
    updatedAt: now,
    memberId,
    title: event.title,
    notes: event.notes,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    color: getSharedCalendarEventColor(event.calendarId),
    activityTypeKey: inferCalendarActivityTypeFromTitle(event.title),
    recurrence: defaultRecurrence(),
    googleEventId: event.uid,
    googleCalendarId: event.calendarId,
  }));
}

/** 從個人行程庫移除誤存的共用行程（一次性清理） */
export function purgeSharedEventsFromPersonalStorage(storage: StorageAdapter, sharedCalendarIds: Set<string>): void {
  const raw = storage.getItem(STORAGE_KEYS.calendarEvents);
  const events = parseEvents(raw);
  const filtered = events.filter((event) => {
    if (event.id.startsWith("shared:")) {
      return false;
    }
    if (event.googleCalendarId && sharedCalendarIds.has(event.googleCalendarId)) {
      return false;
    }
    if (event.googleCalendarId && isSharedGoogleCalendarId(event.googleCalendarId)) {
      return false;
    }
    return true;
  });
  if (filtered.length !== events.length) {
    storage.setItem(STORAGE_KEYS.calendarEvents, JSON.stringify(filtered));
  }
}

export function isPersonalCalendarEvent(event: CalendarEvent): boolean {
  if (event.id.startsWith("shared:")) {
    return false;
  }
  return !isSharedGoogleCalendarId(event.googleCalendarId);
}
