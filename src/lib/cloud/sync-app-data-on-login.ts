import {
  fetchCloudAppData,
  localHasSyncableData,
  pushAllLocalAppData,
  pushCloudAppDataKeys,
  serializeCloudPayload,
} from "@/lib/cloud/cloud-app-data-service";
import { SYNCABLE_STORAGE_KEYS } from "@/lib/cloud/syncable-storage-keys";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { awaitPendingCloudSync, setCloudSyncPaused } from "@/lib/repositories/syncing-storage-adapter";
import type { EntityId } from "@/types";

/** Pull cloud app data on login; upload local data when cloud is empty. */
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

    const cloudRows = await fetchCloudAppData(memberId);
    const cloudByKey = new Map(cloudRows.map((row) => [row.dataKey, row]));
    const cloudHasData = cloudRows.length > 0;
    const localHasData = localHasSyncableData((key) => storage.getItem(key));

    if (!cloudHasData && localHasData) {
      await pushAllLocalAppData({
        memberId,
        readKey: (key) => storage.getItem(key),
      });
      return;
    }

    for (const key of SYNCABLE_STORAGE_KEYS) {
      const cloudRow = cloudByKey.get(key);
      if (cloudRow) {
        storage.setItem(key, serializeCloudPayload(cloudRow.payload));
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
