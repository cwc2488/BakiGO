import {
  mergeCalendarEventsOnLogin,
  readCalendarEventDeletionTombstoneIds,
} from "@/lib/calendar/calendar-event-deletion-tombstones";
import {
  hydrateCalendarStore,
  upsertCalendarEvents,
  removeCalendarEventIds,
  setCalendarLastCloudUpdatedAt,
  listPersonalCalendarEventsForMember,
} from "@/lib/calendar/calendar-event-store";
import {
  enqueueCalendarPendingMutation,
  listCalendarPendingMutations,
  removeCalendarPendingMutation,
  bumpCalendarPendingRetry,
  writeCalendarLastSyncAt,
  readCalendarLastSyncAt,
} from "@/lib/calendar/calendar-pending-mutations";
import { isPersonalCalendarEvent } from "@/lib/calendar/shared-calendar-storage";
import {
  fetchCloudAppData,
  pushCloudAppDataKeys,
  serializeCloudPayload,
} from "@/lib/cloud/cloud-app-data-service";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { awaitPendingCloudSync, flushPendingCloudSync, setCloudSyncPaused } from "@/lib/repositories/syncing-storage-adapter";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/types/calendar-event";
import type { EntityId } from "@/types";

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

export function applyCloudCalendarPayload(input: {
  storage: StorageAdapter;
  memberId: EntityId;
  payload: unknown;
  updatedAt: string;
}): CalendarEvent[] {
  const tombstoneIds = readCalendarEventDeletionTombstoneIds(input.storage);
  const localRaw = input.storage.getItem(STORAGE_KEYS.calendarEvents);
  const cloudRaw = serializeCloudPayload(input.payload);
  const merged = mergeCalendarEventsOnLogin(localRaw, cloudRaw, tombstoneIds);
  const personal = merged.filter(isPersonalCalendarEvent);
  setCloudSyncPaused(true);
  try {
    input.storage.setItem(STORAGE_KEYS.calendarEvents, JSON.stringify(personal));
  } finally {
    setCloudSyncPaused(false);
  }
  hydrateCalendarStore({
    memberId: input.memberId,
    events: personal.filter((event) => event.memberId === input.memberId),
    lastCloudUpdatedAt: input.updatedAt,
  });
  writeCalendarLastSyncAt(input.updatedAt);
  setCalendarLastCloudUpdatedAt(input.updatedAt);
  return personal;
}

/** Immediate write-through after local optimistic mutation. */
export async function flushCalendarWriteThrough(storage: StorageAdapter): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return;
  }
  await awaitPendingCloudSync();
}

export async function pullCalendarDeltaFromCloud(input: {
  storage: StorageAdapter;
  memberId: EntityId;
}): Promise<{ changed: boolean; updatedAt: string | null }> {
  if (!isSupabaseConfigured()) {
    return { changed: false, updatedAt: null };
  }

  const rows = await fetchCloudAppData(input.memberId);
  const calendarRow = rows.find((row) => row.dataKey === STORAGE_KEYS.calendarEvents);
  if (!calendarRow) {
    return { changed: false, updatedAt: null };
  }

  const lastSync = readCalendarLastSyncAt();
  if (lastSync && calendarRow.updatedAt <= lastSync) {
    // Still hydrate store from local if needed
    const local = createCalendarEventRepository(input.storage)
      .getByMemberId(input.memberId)
      .filter(isPersonalCalendarEvent);
    hydrateCalendarStore({
      memberId: input.memberId,
      events: local,
      lastCloudUpdatedAt: calendarRow.updatedAt,
    });
    return { changed: false, updatedAt: calendarRow.updatedAt };
  }

  applyCloudCalendarPayload({
    storage: input.storage,
    memberId: input.memberId,
    payload: calendarRow.payload,
    updatedAt: calendarRow.updatedAt,
  });
  return { changed: true, updatedAt: calendarRow.updatedAt };
}

export function markCalendarMutationPending(input: {
  eventId: EntityId;
  operation: "create" | "update" | "delete";
}): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueueCalendarPendingMutation({
      eventId: input.eventId,
      operation: input.operation,
      payload: null,
    });
  }
}

/** Flush offline-queued calendar keys via storage adapter push. */
export async function flushCalendarPendingMutationQueue(storage: StorageAdapter): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return;
  }

  const pending = listCalendarPendingMutations();
  if (pending.length === 0) {
    flushPendingCloudSync();
    await awaitPendingCloudSync();
    return;
  }

  try {
    const rawValue = storage.getItem(STORAGE_KEYS.calendarEvents);
    if (rawValue) {
      // Push whole canonical blob (idempotent upsert by member_id,data_key).
      // operationId queue entries are cleared after successful push.
      const { createAuthRepository } = await import("@/lib/repositories/auth-repository");
      const memberId = createAuthRepository(storage).readSession()?.memberId;
      if (memberId) {
        await pushCloudAppDataKeys({
          memberId,
          entries: [
            { dataKey: STORAGE_KEYS.calendarEvents, rawValue },
            {
              dataKey: STORAGE_KEYS.calendarEventDeletionTombstones,
              rawValue: storage.getItem(STORAGE_KEYS.calendarEventDeletionTombstones) ?? "[]",
            },
          ],
        });
        for (const item of pending) {
          removeCalendarPendingMutation(item.operationId);
        }
        writeCalendarLastSyncAt(new Date().toISOString());
      }
    } else {
      for (const item of pending) {
        removeCalendarPendingMutation(item.operationId);
      }
    }
  } catch {
    for (const item of pending) {
      bumpCalendarPendingRetry(item.operationId);
    }
  }
}

export function bootstrapCalendarStoreFromLocal(input: {
  storage: StorageAdapter;
  memberId: EntityId;
}): CalendarEvent[] {
  const events = createCalendarEventRepository(input.storage)
    .getByMemberId(input.memberId)
    .filter(isPersonalCalendarEvent);
  hydrateCalendarStore({
    memberId: input.memberId,
    events,
    lastCloudUpdatedAt: readCalendarLastSyncAt(),
  });
  return events;
}

export function syncStoreFromLocalStorage(storage: StorageAdapter, memberId: EntityId): void {
  const events = listPersonalCalendarEventsForMember(memberId);
  const local = createCalendarEventRepository(storage)
    .getByMemberId(memberId)
    .filter(isPersonalCalendarEvent);
  // Prefer newer updatedAt per id
  const byId = new Map(events.map((event) => [event.id, event]));
  for (const event of local) {
    const existing = byId.get(event.id);
    if (!existing || event.updatedAt >= existing.updatedAt) {
      byId.set(event.id, event);
    }
  }
  const localIds = new Set(local.map((event) => event.id));
  const removed = [...byId.keys()].filter((id) => !localIds.has(id));
  if (removed.length > 0) {
    removeCalendarEventIds(removed);
  }
  upsertCalendarEvents([...byId.values()]);
}

export { parseEvents as parseCalendarCloudEvents };
