/**
 * Bounded LRU + TTL cache for shared calendar date ranges.
 * Never unbounded Map growth.
 */
import type { CalendarEvent } from "@/types/calendar-event";

interface RangeCacheEntry {
  key: string;
  events: CalendarEvent[];
  lastAccessAt: number;
  expiresAt: number;
}

const MAX_ENTRIES = 6;
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const cache = new Map<string, RangeCacheEntry>();

export function makeRangeCacheKey(input: {
  memberId: string;
  rangeStart: string;
  rangeEnd: string;
}): string {
  return `${input.memberId}:${input.rangeStart}:${input.rangeEnd}`;
}

export function getRangeCachedEvents(key: string): CalendarEvent[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  entry.lastAccessAt = Date.now();
  return entry.events;
}

export function setRangeCachedEvents(key: string, events: CalendarEvent[]): void {
  cache.set(key, {
    key,
    events,
    lastAccessAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  });
  evictIfNeeded();
}

function evictIfNeeded(): void {
  while (cache.size > MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;
    for (const [key, entry] of cache) {
      if (entry.lastAccessAt < oldestAccess) {
        oldestAccess = entry.lastAccessAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      cache.delete(oldestKey);
    } else {
      break;
    }
  }
}

export function clearRangeCache(): void {
  cache.clear();
}

export function getRangeCacheSize(): number {
  return cache.size;
}
