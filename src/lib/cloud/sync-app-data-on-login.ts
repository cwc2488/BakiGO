import {
  fetchCloudAppData,
  localHasSyncableData,
  pushAllLocalAppData,
  pushCloudAppDataKeys,
  serializeCloudPayload,
} from "@/lib/cloud/cloud-app-data-service";
import { reconcileRetailTransactionsDuringLoginSync } from "@/lib/cloud/reconcile-retail-transactions";
import { SYNCABLE_STORAGE_KEYS } from "@/lib/cloud/syncable-storage-keys";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { awaitPendingCloudSync, setCloudSyncPaused } from "@/lib/repositories/syncing-storage-adapter";
import {
  mergeCalendarEventDeletionTombstonesOnLogin,
  mergeCalendarEventsOnLogin,
} from "@/lib/calendar/calendar-event-deletion-tombstones";
import type { EntityId } from "@/types";

function mergeRetailTombstonePayloads(
  localRaw: string | null,
  cloudRaw: string | null,
): string {
  const byId = new Map<string, { transactionId: string; memberId: string; deletedAt: string }>();
  const ingest = (raw: string | null) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        const item = row as { transactionId?: string; memberId?: string; deletedAt?: string };
        if (typeof item.transactionId === "string" && item.transactionId.length > 0) {
          byId.set(item.transactionId, {
            transactionId: item.transactionId,
            memberId: typeof item.memberId === "string" ? item.memberId : "",
            deletedAt:
              typeof item.deletedAt === "string" ? item.deletedAt : new Date().toISOString(),
          });
        }
      }
    } catch {
      /* ignore */
    }
  };
  ingest(cloudRaw);
  ingest(localRaw);
  return JSON.stringify([...byId.values()]);
}

type CloudAppDataRow = Awaited<ReturnType<typeof fetchCloudAppData>>[number];

/**
 * Merge calendar tombstones first, then events — prevents a stale device from
 * resurrecting events deleted (and tombstoned) on another device.
 */
async function hydrateCalendarEventsFromCloud(options: {
  storage: StorageAdapter;
  memberId: EntityId;
  cloudByKey: Map<string, CloudAppDataRow>;
}): Promise<void> {
  const { storage, memberId, cloudByKey } = options;
  const cloudEventsRow = cloudByKey.get(STORAGE_KEYS.calendarEvents);
  const cloudTombstoneRow = cloudByKey.get(STORAGE_KEYS.calendarEventDeletionTombstones);

  const mergedTombstones = mergeCalendarEventDeletionTombstonesOnLogin(
    storage.getItem(STORAGE_KEYS.calendarEventDeletionTombstones),
    cloudTombstoneRow ? serializeCloudPayload(cloudTombstoneRow.payload) : null,
  );
  const mergedTombstonesRaw = JSON.stringify(mergedTombstones);
  storage.setItem(STORAGE_KEYS.calendarEventDeletionTombstones, mergedTombstonesRaw);

  const tombstoneIds = new Set(mergedTombstones.map((tombstone) => tombstone.eventId));
  const cloudEventsRaw = cloudEventsRow
    ? serializeCloudPayload(cloudEventsRow.payload)
    : null;
  const mergedEvents = mergeCalendarEventsOnLogin(
    storage.getItem(STORAGE_KEYS.calendarEvents),
    cloudEventsRaw,
    tombstoneIds,
  );
  const mergedEventsRaw = JSON.stringify(mergedEvents);
  storage.setItem(STORAGE_KEYS.calendarEvents, mergedEventsRaw);

  const entries: { dataKey: string; rawValue: string }[] = [
    { dataKey: STORAGE_KEYS.calendarEventDeletionTombstones, rawValue: mergedTombstonesRaw },
  ];
  if (cloudEventsRow || mergedEvents.length > 0 || storage.getItem(STORAGE_KEYS.calendarEvents)) {
    entries.push({ dataKey: STORAGE_KEYS.calendarEvents, rawValue: mergedEventsRaw });
  }

  await pushCloudAppDataKeys({ memberId, entries });
}

/**
 * Pull cloud app data on login; upload local data when cloud is empty.
 *
 * Legacy Retail House (`baki-go:retail-transactions`) uses merge-first
 * reconciliation — never blind-overwrite local with empty cloud.
 */
export async function syncAppDataOnLogin(
  storage: StorageAdapter,
  memberId: EntityId,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  setCloudSyncPaused(true);
  try {
    await awaitPendingCloudSync();

    // HARD GATE: capture local authoritative RH sources before cloud hydration can wipe them.
    const retailTransactionsLocalSnapshot = storage.getItem(STORAGE_KEYS.retailTransactions);
    const bakiEventsLocalSnapshot = storage.getItem(STORAGE_KEYS.bakiEvents);

    const cloudRows = await fetchCloudAppData(memberId);
    const cloudByKey = new Map(cloudRows.map((row) => [row.dataKey, row]));
    const cloudHasData = cloudRows.length > 0;
    const localHasData = localHasSyncableData((key) => storage.getItem(key));

    if (!cloudHasData && localHasData) {
      await pushAllLocalAppData({
        memberId,
        readKey: (key) => storage.getItem(key),
      });
      // Still run merge reconciliation so diagnostics + idempotent upsert are consistent
      // when the only missing key was retail-transactions among an otherwise empty cloud.
      await reconcileRetailTransactionsDuringLoginSync({
        storage,
        memberId,
        cloudPayload: null,
        localRetailRawSnapshot: retailTransactionsLocalSnapshot,
        localBakiEventsRawSnapshot: bakiEventsLocalSnapshot,
      });
      return;
    }

    let calendarHydrated = false;

    for (const key of SYNCABLE_STORAGE_KEYS) {
      // bakiEvents is reconciled together with retailTransactions — never
      // blind-hydrate cloud events over local (would resurrect deletes).
      if (key === STORAGE_KEYS.bakiEvents) {
        continue;
      }

      if (key === STORAGE_KEYS.retailTransactions) {
        const cloudRow = cloudByKey.get(key);
        const cloudBakiRow = cloudByKey.get(STORAGE_KEYS.bakiEvents);
        await reconcileRetailTransactionsDuringLoginSync({
          storage,
          memberId,
          cloudRetailPayload: cloudRow ? cloudRow.payload : null,
          cloudBakiEventsPayload: cloudBakiRow ? cloudBakiRow.payload : null,
          localRetailRawSnapshot: retailTransactionsLocalSnapshot,
          localBakiEventsRawSnapshot: bakiEventsLocalSnapshot,
        });
        continue;
      }

      // Handled together with calendarEvents (tombstones must apply first).
      if (key === STORAGE_KEYS.calendarEventDeletionTombstones) {
        continue;
      }

      if (key === STORAGE_KEYS.calendarEvents) {
        const hasCloudCalendar =
          cloudByKey.has(STORAGE_KEYS.calendarEvents) ||
          cloudByKey.has(STORAGE_KEYS.calendarEventDeletionTombstones);
        const hasLocalCalendar =
          Boolean(storage.getItem(STORAGE_KEYS.calendarEvents)) ||
          Boolean(storage.getItem(STORAGE_KEYS.calendarEventDeletionTombstones));
        if (hasCloudCalendar || hasLocalCalendar) {
          await hydrateCalendarEventsFromCloud({ storage, memberId, cloudByKey });
          calendarHydrated = true;
        }
        continue;
      }

      const cloudRow = cloudByKey.get(key);
      if (cloudRow) {
        if (key === STORAGE_KEYS.retailTransactionDeletionTombstones) {
          const mergedRaw = mergeRetailTombstonePayloads(
            storage.getItem(key),
            serializeCloudPayload(cloudRow.payload),
          );
          storage.setItem(key, mergedRaw);
          await pushCloudAppDataKeys({
            memberId,
            entries: [{ dataKey: key, rawValue: mergedRaw }],
          });
        } else {
          storage.setItem(key, serializeCloudPayload(cloudRow.payload));
        }
        continue;
      }

      const localValue = storage.getItem(key);
      if (localValue) {
        await pushCloudAppDataKeys({
          memberId,
          entries: [{ dataKey: key, rawValue: localValue }],
        });
      }
    }

    // Cloud may only have tombstones (no events row); still merge once.
    if (
      !calendarHydrated &&
      cloudByKey.has(STORAGE_KEYS.calendarEventDeletionTombstones)
    ) {
      await hydrateCalendarEventsFromCloud({ storage, memberId, cloudByKey });
    }

    storage.removeItem(STORAGE_KEYS.computedMetrics);
  } finally {
    setCloudSyncPaused(false);
  }
}
