import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import {
  readCalendarEventDeletionTombstones,
} from "@/lib/calendar/calendar-event-deletion-tombstones";
import type { CalendarEvent } from "@/types/calendar-event";
import { isStorageQuotaError } from "@/lib/repositories/storage-quota-error";

export const CALENDAR_TOMBSTONE_MAX_COUNT = 200;
export const CALENDAR_TOMBSTONE_MAX_AGE_DAYS = 45;
/** Soft cap for shared-calendar JSON in localStorage (~chars). */
export const SHARED_CALENDAR_LOCAL_MAX_CHARS = 800_000;

interface TombstoneLike {
  eventId: string;
  deletedAt: string;
}

function pruneTombstoneList(
  items: TombstoneLike[],
  nowMs: number,
  maxAgeDays: number,
  maxCount: number,
): TombstoneLike[] {
  const minMs = nowMs - maxAgeDays * 24 * 60 * 60 * 1000;
  const fresh = items.filter((item) => {
    const deletedAt = new Date(item.deletedAt).getTime();
    return Number.isFinite(deletedAt) && deletedAt >= minMs;
  });
  fresh.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  return fresh.slice(0, maxCount);
}

/** Prevent unbounded calendar deletion tombstone growth (audit follow-up). */
export function pruneCalendarEventDeletionTombstones(
  storage: StorageAdapter,
  options?: { now?: Date; maxAgeDays?: number; maxCount?: number },
): number {
  const nowMs = (options?.now ?? new Date()).getTime();
  const maxAgeDays = options?.maxAgeDays ?? CALENDAR_TOMBSTONE_MAX_AGE_DAYS;
  const maxCount = options?.maxCount ?? CALENDAR_TOMBSTONE_MAX_COUNT;
  const current = readCalendarEventDeletionTombstones(storage);
  const next = pruneTombstoneList(current, nowMs, maxAgeDays, maxCount);
  if (next.length === current.length) {
    return 0;
  }
  storage.setItem(STORAGE_KEYS.calendarEventDeletionTombstones, JSON.stringify(next));
  return current.length - next.length;
}

export function pruneCalendarGoogleDeletionTombstones(
  storage: StorageAdapter,
  options?: { now?: Date; maxAgeDays?: number; maxCount?: number },
): number {
  const raw = storage.getItem(STORAGE_KEYS.calendarGoogleDeletionTombstones);
  if (!raw) return 0;
  let parsed: TombstoneLike[] = [];
  try {
    const value = JSON.parse(raw) as unknown;
    parsed = Array.isArray(value) ? (value as TombstoneLike[]) : [];
  } catch {
    return 0;
  }
  const nowMs = (options?.now ?? new Date()).getTime();
  const maxAgeDays = options?.maxAgeDays ?? CALENDAR_TOMBSTONE_MAX_AGE_DAYS;
  const maxCount = options?.maxCount ?? CALENDAR_TOMBSTONE_MAX_COUNT;
  const next = pruneTombstoneList(parsed, nowMs, maxAgeDays, maxCount);
  if (next.length === parsed.length) return 0;
  storage.setItem(STORAGE_KEYS.calendarGoogleDeletionTombstones, JSON.stringify(next));
  return parsed.length - next.length;
}

/**
 * Keep shared calendar local cache within a char budget by dropping events
 * farthest from today first. Prefers not throwing QuotaExceeded.
 */
export function boundSharedCalendarEventsForLocalCache(
  events: CalendarEvent[],
  options?: { maxChars?: number; referenceDate?: string },
): CalendarEvent[] {
  const maxChars = options?.maxChars ?? SHARED_CALENDAR_LOCAL_MAX_CHARS;
  const reference = options?.referenceDate ?? new Date().toISOString().slice(0, 10);
  const referenceMs = new Date(`${reference}T12:00:00`).getTime();

  const ranked = [...events].sort((a, b) => {
    const aMs = Math.abs(new Date(a.startAt).getTime() - referenceMs);
    const bMs = Math.abs(new Date(b.startAt).getTime() - referenceMs);
    return aMs - bMs;
  });

  const kept: CalendarEvent[] = [];
  let size = 2; // []
  for (const event of ranked) {
    const piece = JSON.stringify(event);
    const nextSize = size + piece.length + (kept.length > 0 ? 1 : 0);
    if (nextSize > maxChars) {
      break;
    }
    kept.push(event);
    size = nextSize;
  }
  return kept;
}

export function saveSharedCalendarCacheBounded(
  storage: StorageAdapter,
  events: CalendarEvent[],
  write: (bounded: CalendarEvent[]) => void,
): CalendarEvent[] {
  const bounded = boundSharedCalendarEventsForLocalCache(events);
  try {
    write(bounded);
    return bounded;
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      throw error;
    }
    // Aggressive shrink then retry once.
    const smaller = boundSharedCalendarEventsForLocalCache(bounded, {
      maxChars: Math.floor(SHARED_CALENDAR_LOCAL_MAX_CHARS / 4),
    });
    try {
      storage.removeItem(STORAGE_KEYS.sharedCalendarEvents);
    } catch {
      /* ignore cleanup failure */
    }
    try {
      write(smaller);
      return smaller;
    } catch (retryError) {
      // Let caller decide — shared sync must stay non-blocking.
      throw retryError;
    }
  }
}

/** Run all calendar local retention cleanups after a successful cloud sync. */
export function pruneCalendarLocalRetention(storage: StorageAdapter): void {
  pruneCalendarEventDeletionTombstones(storage);
  pruneCalendarGoogleDeletionTombstones(storage);
}
