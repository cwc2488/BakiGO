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
  mergeCalendarEventsOnLogin,
  readCalendarEventDeletionTombstoneIds,
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

      const cloudRow = cloudByKey.get(key);
      if (cloudRow) {
        if (key === STORAGE_KEYS.calendarEvents) {
          const tombstoneIds = readCalendarEventDeletionTombstoneIds(storage);
          const merged = mergeCalendarEventsOnLogin(
            storage.getItem(key),
            serializeCloudPayload(cloudRow.payload),
            tombstoneIds,
          );
          const mergedRaw = JSON.stringify(merged);
          storage.setItem(key, mergedRaw);
          await pushCloudAppDataKeys({
            memberId,
            entries: [{ dataKey: key, rawValue: mergedRaw }],
          });
        } else if (key === STORAGE_KEYS.retailTransactionDeletionTombstones) {
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

    storage.removeItem(STORAGE_KEYS.computedMetrics);
  } finally {
    setCloudSyncPaused(false);
  }
}
