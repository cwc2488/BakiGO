import { defaultRecurrence } from "@/lib/calendar/recurrence";
import { inferCalendarActivityTypeFromTitle } from "@/lib/calendar/calendar-activity-types";
import { isSharedGoogleCalendarId, getSharedCalendarEventColor } from "@/lib/calendar/shared-calendars";
import {
  deleteSharedCalendarIdbCache,
  readSharedCalendarIdbCache,
  writeSharedCalendarIdbCache,
} from "@/lib/calendar/shared-calendar-idb-cache";
import {
  SHARED_CALENDAR_CACHE_VERSION,
  clearSharedCalendarMemoryCache,
  getSharedCalendarMemoryCache,
  isSharedCalendarSnapshotFresh,
  setSharedCalendarMemoryCache,
  type SharedCalendarCacheSnapshot,
} from "@/lib/calendar/shared-calendar-session-cache";
import type { CalendarEvent, CalendarEventColor } from "@/types/calendar-event";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";

/**
 * Bumped when shared-calendar cache leaves localStorage event blobs for
 * memory + IndexedDB. Old LS event JSON is migrated then deleted.
 */
export const SHARED_CALENDAR_DATA_VERSION = 6;

export interface SharedCalendarCacheMeta {
  syncedDate: string;
  rangeStart: string;
  rangeEnd: string;
  memberId: string;
  syncedAt: string;
}

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

function parseCacheMeta(raw: string | null): SharedCalendarCacheMeta | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SharedCalendarCacheMeta;
  } catch {
    return null;
  }
}

function snapshotToMeta(snapshot: SharedCalendarCacheSnapshot): SharedCalendarCacheMeta {
  return {
    syncedDate: snapshot.syncedAt.slice(0, 10),
    rangeStart: snapshot.rangeStart,
    rangeEnd: snapshot.rangeEnd,
    memberId: snapshot.memberId,
    syncedAt: snapshot.syncedAt,
  };
}

function clearLegacySharedCalendarEventBlob(storage: StorageAdapter): void {
  try {
    storage.removeItem(STORAGE_KEYS.sharedCalendarEvents);
  } catch (error) {
    console.warn("[calendar] failed to clear legacy shared calendar localStorage blob", error);
  }
}

function writeTinySharedCalendarMeta(storage: StorageAdapter, meta: SharedCalendarCacheMeta): void {
  try {
    storage.setItem(STORAGE_KEYS.sharedCalendarCacheMeta, JSON.stringify(meta));
    markSharedCalendarStorageFresh(storage);
  } catch (error) {
    // Tiny meta is optional — memory/IDB remain the real cache.
    console.warn("[calendar] shared calendar meta localStorage write failed", error);
  }
}

/**
 * Synchronous read for UI first paint.
 * Prefers module memory (survives SPA route changes).
 */
export function loadSharedCalendarEvents(
  storage: StorageAdapter,
  memberId?: string,
): CalendarEvent[] {
  const memory = getSharedCalendarMemoryCache(memberId);
  if (memory) {
    return memory.events.slice();
  }

  // Legacy fallback for callers that have not hydrated yet in this session.
  return parseEvents(storage.getItem(STORAGE_KEYS.sharedCalendarEvents));
}

export function loadSharedCalendarCacheMeta(storage: StorageAdapter): SharedCalendarCacheMeta | null {
  const memory = getSharedCalendarMemoryCache();
  if (memory) {
    return snapshotToMeta(memory);
  }
  return parseCacheMeta(storage.getItem(STORAGE_KEYS.sharedCalendarCacheMeta));
}

/**
 * Persist shared-calendar cache to memory + IndexedDB.
 * Never writes the full events JSON to localStorage (quota-safe).
 * localStorage may keep a tiny meta tip only.
 */
export function saveSharedCalendarCache(
  storage: StorageAdapter,
  events: CalendarEvent[],
  meta: SharedCalendarCacheMeta,
): boolean {
  const snapshot: SharedCalendarCacheSnapshot = {
    memberId: meta.memberId,
    events: events.slice(),
    syncedAt: meta.syncedAt,
    rangeStart: meta.rangeStart,
    rangeEnd: meta.rangeEnd,
    version: SHARED_CALENDAR_CACHE_VERSION,
  };

  setSharedCalendarMemoryCache(snapshot);
  clearLegacySharedCalendarEventBlob(storage);
  writeTinySharedCalendarMeta(storage, meta);
  void writeSharedCalendarIdbCache(snapshot);
  return true;
}

/**
 * Fresh only when we actually have events in memory and syncedAt is within
 * the freshness window. Tiny LS meta alone is not enough.
 */
export function isSharedCalendarCacheFresh(storage: StorageAdapter, memberId: string): boolean {
  const memory = getSharedCalendarMemoryCache(memberId);
  if (memory && isSharedCalendarSnapshotFresh(memory)) {
    return true;
  }

  void storage;
  return false;
}

export function clearSharedCalendarEvents(storage: StorageAdapter): void {
  clearSharedCalendarMemoryCache();
  clearLegacySharedCalendarEventBlob(storage);
  try {
    storage.removeItem(STORAGE_KEYS.sharedCalendarCacheMeta);
  } catch {
    /* ignore */
  }
}

export function migrateSharedCalendarStorageIfNeeded(storage: StorageAdapter): boolean {
  const current = storage.getItem(STORAGE_KEYS.sharedCalendarDataVersion);
  if (current === String(SHARED_CALENDAR_DATA_VERSION)) {
    return false;
  }
  // Do not delete legacy event blobs here — hydrateSharedCalendarCache migrates
  // them into memory/IndexedDB first, then clears localStorage.
  storage.setItem(STORAGE_KEYS.sharedCalendarDataVersion, String(SHARED_CALENDAR_DATA_VERSION));
  return true;
}

export function resetSharedCalendarCache(storage: StorageAdapter): void {
  const memory = getSharedCalendarMemoryCache();
  clearSharedCalendarEvents(storage);
  if (memory?.memberId) {
    void deleteSharedCalendarIdbCache(memory.memberId);
  }
  storage.setItem(STORAGE_KEYS.sharedCalendarDataVersion, String(SHARED_CALENDAR_DATA_VERSION));
}

export function markSharedCalendarStorageFresh(storage: StorageAdapter): void {
  storage.setItem(STORAGE_KEYS.sharedCalendarDataVersion, String(SHARED_CALENDAR_DATA_VERSION));
}

/**
 * Load memory → IndexedDB → legacy localStorage blob (migrate once).
 * Safe when IndexedDB is missing/broken — returns whatever memory/legacy has.
 */
export async function hydrateSharedCalendarCache(
  storage: StorageAdapter,
  memberId: string,
): Promise<SharedCalendarCacheSnapshot | null> {
  migrateSharedCalendarStorageIfNeeded(storage);

  const memory = getSharedCalendarMemoryCache(memberId);
  if (memory) {
    clearLegacySharedCalendarEventBlob(storage);
    return memory;
  }

  const fromIdb = await readSharedCalendarIdbCache(memberId);
  if (fromIdb && fromIdb.memberId === memberId) {
    setSharedCalendarMemoryCache(fromIdb);
    clearLegacySharedCalendarEventBlob(storage);
    writeTinySharedCalendarMeta(storage, snapshotToMeta(fromIdb));
    return fromIdb;
  }

  const legacyEvents = parseEvents(storage.getItem(STORAGE_KEYS.sharedCalendarEvents));
  const legacyMeta = parseCacheMeta(storage.getItem(STORAGE_KEYS.sharedCalendarCacheMeta));
  if (legacyEvents.length > 0 && (!legacyMeta || legacyMeta.memberId === memberId)) {
    const snapshot: SharedCalendarCacheSnapshot = {
      memberId,
      events: legacyEvents,
      syncedAt: legacyMeta?.syncedAt ?? new Date(0).toISOString(),
      rangeStart: legacyMeta?.rangeStart ?? "",
      rangeEnd: legacyMeta?.rangeEnd ?? "",
      version: SHARED_CALENDAR_CACHE_VERSION,
    };
    setSharedCalendarMemoryCache(snapshot);
    clearLegacySharedCalendarEventBlob(storage);
    writeTinySharedCalendarMeta(storage, snapshotToMeta(snapshot));
    void writeSharedCalendarIdbCache(snapshot);
    return snapshot;
  }

  clearLegacySharedCalendarEventBlob(storage);
  return null;
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
export function purgeSharedEventsFromPersonalStorage(
  storage: StorageAdapter,
  sharedCalendarIds: Set<string>,
): void {
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
    try {
      storage.setItem(STORAGE_KEYS.calendarEvents, JSON.stringify(filtered));
    } catch (error) {
      // Non-critical cleanup — do not block calendar load.
      console.warn("[calendar] purge shared-from-personal write failed", error);
    }
  }
}

export function isPersonalCalendarEvent(event: CalendarEvent): boolean {
  if (event.id.startsWith("shared:")) {
    return false;
  }
  return !isSharedGoogleCalendarId(event.googleCalendarId);
}
