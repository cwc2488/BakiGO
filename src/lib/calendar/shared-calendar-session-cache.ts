import type { CalendarEvent } from "@/types/calendar-event";

/** Mid-point of the requested 30–60 minute freshness window. */
export const SHARED_CALENDAR_FRESHNESS_MS = 45 * 60 * 1000;

export const SHARED_CALENDAR_CACHE_VERSION = 1;

export type SharedCalendarCacheSnapshot = {
  memberId: string;
  events: CalendarEvent[];
  syncedAt: string;
  rangeStart: string;
  rangeEnd: string;
  version: number;
};

let memoryCache: SharedCalendarCacheSnapshot | null = null;

export function getSharedCalendarMemoryCache(
  memberId?: string,
): SharedCalendarCacheSnapshot | null {
  if (!memoryCache) {
    return null;
  }
  if (memberId && memoryCache.memberId !== memberId) {
    return null;
  }
  return memoryCache;
}

export function setSharedCalendarMemoryCache(snapshot: SharedCalendarCacheSnapshot): void {
  memoryCache = {
    ...snapshot,
    events: snapshot.events.slice(),
    version: snapshot.version || SHARED_CALENDAR_CACHE_VERSION,
  };
}

export function clearSharedCalendarMemoryCache(memberId?: string): void {
  if (!memoryCache) {
    return;
  }
  if (memberId && memoryCache.memberId !== memberId) {
    return;
  }
  memoryCache = null;
}

export function isSharedCalendarSnapshotFresh(
  snapshot: SharedCalendarCacheSnapshot | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!snapshot?.syncedAt) {
    return false;
  }
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  if (!Number.isFinite(syncedAtMs)) {
    return false;
  }
  return nowMs - syncedAtMs < SHARED_CALENDAR_FRESHNESS_MS;
}

/** Test helper — reset module state between cases. */
export function __resetSharedCalendarMemoryCacheForTests(): void {
  memoryCache = null;
}
