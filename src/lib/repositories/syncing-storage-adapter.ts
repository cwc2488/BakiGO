import { pushCloudAppDataKeys } from "@/lib/cloud/cloud-app-data-service";
import { isSyncableStorageKey } from "@/lib/cloud/syncable-storage-keys";
import { createAuthRepository } from "@/lib/repositories/auth-repository";
import { LocalStorageAdapter } from "@/lib/repositories/local-storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { EntityId } from "@/types";

let cloudSyncPaused = false;
const pendingKeys = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushSourceStorage: StorageAdapter | null = null;

const PUSH_DEBOUNCE_MS = 1500;

export function setCloudSyncPaused(paused: boolean): void {
  cloudSyncPaused = paused;
}

export function flushPendingCloudSync(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  void runCloudPush();
}

function readSyncMemberId(): EntityId | null {
  const storage = pushSourceStorage ?? new LocalStorageAdapter();
  return createAuthRepository(storage).readSession()?.memberId ?? null;
}

function scheduleCloudPush(key: string): void {
  if (cloudSyncPaused || !isSyncableStorageKey(key) || !isSupabaseConfigured()) {
    return;
  }

  pendingKeys.add(key);

  if (pushTimer) {
    clearTimeout(pushTimer);
  }

  pushTimer = setTimeout(() => {
    pushTimer = null;
    void runCloudPush();
  }, PUSH_DEBOUNCE_MS);
}

async function runCloudPush(): Promise<void> {
  const memberId = readSyncMemberId();
  const inner = pushSourceStorage;
  if (!memberId || !inner || pendingKeys.size === 0 || cloudSyncPaused || !isSupabaseConfigured()) {
    pendingKeys.clear();
    return;
  }

  const keys = [...pendingKeys];
  pendingKeys.clear();

  const entries = keys.flatMap((key) => {
    const rawValue = inner.getItem(key);
    if (!rawValue) {
      return [];
    }
    return [{ dataKey: key, rawValue }];
  });

  try {
    await pushCloudAppDataKeys({ memberId, entries });
  } catch (error) {
    console.error("Cloud sync push failed:", error);
    keys.forEach((key) => pendingKeys.add(key));
  }
}

export class SyncingStorageAdapter implements StorageAdapter {
  constructor(private readonly inner: StorageAdapter) {
    pushSourceStorage = inner;
  }

  getItem(key: string): string | null {
    return this.inner.getItem(key);
  }

  setItem(key: string, value: string): void {
    this.inner.setItem(key, value);
    scheduleCloudPush(key);
  }

  removeItem(key: string): void {
    this.inner.removeItem(key);
    if (isSyncableStorageKey(key)) {
      scheduleCloudPush(key);
    }
  }
}

export function createSyncingStorageAdapter(inner: StorageAdapter): StorageAdapter {
  if (typeof window === "undefined" || !isSupabaseConfigured()) {
    return inner;
  }
  return new SyncingStorageAdapter(inner);
}
