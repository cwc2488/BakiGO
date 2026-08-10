import { syncCustomersOnLogin } from "@/lib/cloud/customer-cloud-service";
import { syncGoogleCalendarConnectionOnLogin } from "@/lib/cloud/google-calendar-cloud-service";
import { syncAppDataOnLogin } from "@/lib/cloud/sync-app-data-on-login";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";
import { AuthError } from "@/types/auth";

export type CloudAuthMember = {
  id: EntityId;
  memberNumber: string;
  email: string;
};

/** Pull latest org + member data from Supabase after auth is established. */
export async function syncCloudAuthData(
  storage: StorageAdapter,
  member: CloudAuthMember,
): Promise<void> {
  try {
    await syncCloudMembersToLocalStorage(storage);
    await Promise.all([
      syncAppDataOnLogin(storage, member.id),
      syncCustomersOnLogin(storage, member.id),
      syncGoogleCalendarConnectionOnLogin(storage, member.id),
    ]);
  } catch (error) {
    throw new AuthError(
      "cloud_sync_failed",
      error instanceof Error ? error.message : "無法同步雲端資料",
    );
  }
}

let backgroundSyncPromise: Promise<void> | null = null;
let backgroundSyncVersion = 0;

export function getCloudBackgroundSyncVersion(): number {
  return backgroundSyncVersion;
}

export function getCloudBackgroundSyncPromise(): Promise<void> | null {
  return backgroundSyncPromise;
}

export function startCloudAuthBackgroundSync(
  storage: StorageAdapter,
  member: CloudAuthMember,
): Promise<void> {
  backgroundSyncVersion += 1;
  backgroundSyncPromise = syncCloudAuthData(storage, member)
    .catch((error) => {
      console.error("[cloud-sync] background sync failed", error);
    })
    .finally(() => {
      backgroundSyncPromise = null;
    });
  return backgroundSyncPromise;
}

export async function awaitCloudAuthBackgroundSync(): Promise<void> {
  if (backgroundSyncPromise) {
    await backgroundSyncPromise;
  }
}
