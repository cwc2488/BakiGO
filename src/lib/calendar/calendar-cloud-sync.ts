import {
  hydratePersonalCalendarRange,
  upsertCalendarEvents,
  removeCalendarEventIds,
  setCalendarLastCloudUpdatedAt,
  listPersonalCalendarEventsForMember,
  getCalendarStoreSnapshot,
} from "@/lib/calendar/calendar-event-store";
import {
  enqueueCalendarPendingMutation,
  listCalendarPendingMutations,
  removeCalendarPendingMutation,
  bumpCalendarPendingRetry,
  writeCalendarLastSyncAt,
  readCalendarLastSyncAt,
  type CalendarPendingMutation,
} from "@/lib/calendar/calendar-pending-mutations";
import { pruneCalendarLocalRetention } from "@/lib/calendar/calendar-storage-bounds";
import { isPersonalCalendarEvent } from "@/lib/calendar/shared-calendar-storage";
import { addDays } from "@/lib/calendar/recurrence";
import { getTodayDateString } from "@/lib/calendar/time-grid";
import { awaitCalendarEventCloudWrites } from "@/lib/calendar/calendar-event-cloud-write-tracker";
import type { CalendarEventRealtimeChange } from "@/lib/calendar/calendar-subscription-registry";
import {
  fetchCloudCalendarEventsInRange,
  fetchCloudCalendarEventsUpdatedSince,
  softDeleteCloudCalendarEvent,
  upsertCloudCalendarEvent,
  upsertCloudCalendarEventsBatch,
} from "@/lib/cloud/calendar-events-cloud-service";
import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import {
  clearLegacyCalendarEventsBlob,
  readLegacyCalendarEventsBlob,
} from "@/lib/repositories/calendar-event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { awaitPendingCloudSync } from "@/lib/repositories/syncing-storage-adapter";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/types/calendar-event";
import type { EntityId } from "@/types";

/** Default personal sync window: visible month ± ~1 month buffer. */
export const PERSONAL_CALENDAR_SYNC_RANGE_DAYS = 45;

export function getPersonalCalendarSyncRange(referenceDate = getTodayDateString()): {
  rangeStart: string;
  rangeEnd: string;
} {
  return {
    rangeStart: addDays(referenceDate, -PERSONAL_CALENDAR_SYNC_RANGE_DAYS),
    rangeEnd: addDays(referenceDate, PERSONAL_CALENDAR_SYNC_RANGE_DAYS),
  };
}

/** Apply a single realtime row change — never re-hydrate the full calendar. */
export function applyCalendarEventRealtimeChange(change: CalendarEventRealtimeChange): void {
  if (change.type === "DELETE" || change.event == null) {
    removeCalendarEventIds([change.eventId]);
    writeCalendarLastSyncAt(change.updatedAt);
    setCalendarLastCloudUpdatedAt(change.updatedAt);
    return;
  }
  upsertCalendarEvents([change.event]);
  writeCalendarLastSyncAt(change.updatedAt);
  setCalendarLastCloudUpdatedAt(change.updatedAt);
}

/** Immediate write-through wait: in-flight event rows + any other pending keys. */
export async function flushCalendarWriteThrough(_storage?: StorageAdapter): Promise<void> {
  await awaitCalendarEventCloudWrites();
  await awaitPendingCloudSync();
}

/**
 * Pull only the visible range (+ buffer). Does not download years of history.
 */
export async function pullCalendarRangeFromCloud(input: {
  storage: StorageAdapter;
  memberId: EntityId;
  rangeStart?: string;
  rangeEnd?: string;
}): Promise<{ changed: boolean; count: number }> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(input.memberId)) {
    return { changed: false, count: 0 };
  }

  const range = {
    rangeStart: input.rangeStart ?? getPersonalCalendarSyncRange().rangeStart,
    rangeEnd: input.rangeEnd ?? getPersonalCalendarSyncRange().rangeEnd,
  };

  const events = await fetchCloudCalendarEventsInRange({
    memberId: input.memberId,
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
  });

  hydratePersonalCalendarRange({
    memberId: input.memberId,
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
    events: events.filter(isPersonalCalendarEvent),
    lastCloudUpdatedAt: new Date().toISOString(),
  });
  writeCalendarLastSyncAt(new Date().toISOString());
  pruneCalendarLocalRetention(input.storage);
  return { changed: true, count: events.length };
}

/** Delta refresh using updated_at cursor — used on resume / online. */
export async function pullCalendarDeltaFromCloud(input: {
  storage: StorageAdapter;
  memberId: EntityId;
}): Promise<{ changed: boolean; updatedAt: string | null }> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(input.memberId)) {
    return { changed: false, updatedAt: null };
  }

  const lastSync = readCalendarLastSyncAt();
  if (!lastSync) {
    const result = await pullCalendarRangeFromCloud(input);
    return { changed: result.changed, updatedAt: readCalendarLastSyncAt() };
  }

  const delta = await fetchCloudCalendarEventsUpdatedSince({
    memberId: input.memberId,
    sinceIso: lastSync,
  });

  if (delta.deletedIds.length > 0) {
    removeCalendarEventIds(delta.deletedIds);
  }
  if (delta.events.length > 0) {
    upsertCalendarEvents(delta.events.filter(isPersonalCalendarEvent));
  }
  if (delta.latestUpdatedAt) {
    writeCalendarLastSyncAt(delta.latestUpdatedAt);
    setCalendarLastCloudUpdatedAt(delta.latestUpdatedAt);
  }
  pruneCalendarLocalRetention(input.storage);
  return {
    changed: delta.events.length > 0 || delta.deletedIds.length > 0,
    updatedAt: delta.latestUpdatedAt,
  };
}

/**
 * One-time: migrate legacy localStorage blob → calendar_events rows,
 * then clear the unbounded local blob.
 */
export async function migrateLegacyCalendarBlobToRows(input: {
  storage: StorageAdapter;
  memberId: EntityId;
}): Promise<number> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(input.memberId)) {
    return 0;
  }
  const flagKey = `${STORAGE_KEYS.calendarEvents}:migrated-to-rows`;
  if (typeof window !== "undefined" && window.localStorage.getItem(flagKey) === "1") {
    return 0;
  }

  const local = readLegacyCalendarEventsBlob(input.storage).filter(
    (event) => event.memberId === input.memberId && isPersonalCalendarEvent(event),
  );
  let written = 0;
  if (local.length > 0) {
    written = await upsertCloudCalendarEventsBatch(local);
  }
  clearLegacyCalendarEventsBlob(input.storage);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(flagKey, "1");
  }
  return written;
}

export function markCalendarMutationPending(input: {
  eventId: EntityId;
  operation: "create" | "update" | "delete";
  payload?: CalendarEvent | null;
}): void {
  enqueueCalendarPendingMutation({
    eventId: input.eventId,
    operation: input.operation,
    payload: (input.payload as never) ?? null,
  });
}

function memberIdFromPending(item: CalendarPendingMutation): EntityId | null {
  if (item.payload && typeof item.payload === "object" && "memberId" in item.payload) {
    const memberId = (item.payload as { memberId?: string }).memberId;
    if (typeof memberId === "string" && memberId.length > 0) {
      return memberId;
    }
  }
  const found = getCalendarStoreSnapshot().events.find((event) => event.id === item.eventId);
  return found?.memberId ?? null;
}

function eventFromPending(item: CalendarPendingMutation): CalendarEvent | null {
  if (item.payload && typeof item.payload === "object" && "id" in item.payload) {
    return item.payload as CalendarEvent;
  }
  return getCalendarStoreSnapshot().events.find((event) => event.id === item.eventId) ?? null;
}

/** Flush offline-queued event-level mutations (idempotent upsert / soft-delete). */
export async function flushCalendarPendingMutationQueue(storage: StorageAdapter): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return;
  }

  const pending = listCalendarPendingMutations();
  if (pending.length === 0) {
    await awaitCalendarEventCloudWrites();
    await awaitPendingCloudSync();
    return;
  }

  // Keep latest op per eventId.
  const byEvent = new Map<string, CalendarPendingMutation>();
  for (const item of pending) {
    byEvent.set(item.eventId, item);
  }

  try {
    for (const item of byEvent.values()) {
      if (item.operation === "delete") {
        const memberId = memberIdFromPending(item);
        if (memberId) {
          await softDeleteCloudCalendarEvent({
            memberId,
            eventId: item.eventId,
          });
        }
      } else {
        const event = eventFromPending(item);
        if (event) {
          await upsertCloudCalendarEvent(event);
          upsertCalendarEvents([event]);
        }
      }
    }
    for (const item of pending) {
      removeCalendarPendingMutation(item.operationId);
    }
    writeCalendarLastSyncAt(new Date().toISOString());
    pruneCalendarLocalRetention(storage);
  } catch {
    for (const item of pending) {
      bumpCalendarPendingRetry(item.operationId);
    }
  }
}

export function bootstrapCalendarStoreFromLocal(input: {
  storage: StorageAdapter;
  memberId: EntityId;
  rangeStart?: string;
  rangeEnd?: string;
}): CalendarEvent[] {
  const range = {
    rangeStart: input.rangeStart ?? getPersonalCalendarSyncRange().rangeStart,
    rangeEnd: input.rangeEnd ?? getPersonalCalendarSyncRange().rangeEnd,
  };
  const legacy = readLegacyCalendarEventsBlob(input.storage)
    .filter((event) => event.memberId === input.memberId)
    .filter(isPersonalCalendarEvent);

  const ranged = legacy.filter((event) => {
    if (event.recurrence && event.recurrence.frequency !== "none") {
      return event.startAt.slice(0, 10) <= range.rangeEnd;
    }
    const start = event.startAt.slice(0, 10);
    const end = event.endAt.slice(0, 10);
    return end >= range.rangeStart && start <= range.rangeEnd;
  });

  hydratePersonalCalendarRange({
    memberId: input.memberId,
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
    events: ranged,
    lastCloudUpdatedAt: readCalendarLastSyncAt(),
  });
  return ranged;
}

export function syncStoreFromLocalStorage(storage: StorageAdapter, memberId: EntityId): void {
  const events = listPersonalCalendarEventsForMember(memberId);
  const local = readLegacyCalendarEventsBlob(storage)
    .filter((event) => event.memberId === memberId)
    .filter(isPersonalCalendarEvent);
  const byId = new Map(events.map((event) => [event.id, event]));
  for (const event of local) {
    const existing = byId.get(event.id);
    if (!existing || event.updatedAt >= existing.updatedAt) {
      byId.set(event.id, event);
    }
  }
  upsertCalendarEvents([...byId.values()]);
}

function parseEvents(payload: unknown): CalendarEvent[] {
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return Array.isArray(parsed) ? (parsed as CalendarEvent[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(payload) ? (payload as CalendarEvent[]) : [];
}

export { parseEvents as parseCalendarCloudEvents };
