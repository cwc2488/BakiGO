import { pushCloudAppDataKeys } from "@/lib/cloud/cloud-app-data-service";
import { isSyncableStorageKey } from "@/lib/cloud/syncable-storage-keys";
import { createAuthRepository } from "@/lib/repositories/auth-repository";
import { LocalStorageAdapter } from "@/lib/repositories/local-storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { EntityId } from "@/types";

let cloudSyncPaused = false;
const pendingKeys = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushSourceStorage: StorageAdapter | null = null;
/** Tracks the active network push so awaitPendingCloudSync waits for real completion. */
let inFlightPushPromise: Promise<void> | null = null;

const PUSH_DEBOUNCE_MS = 1500;
/**
 * Keys that flush immediately (non-calendar blobs).
 * Personal calendar events are event-level via calendar_events table — not listed here.
 */
const IMMEDIATE_FLUSH_KEYS = new Set<string>([
  STORAGE_KEYS.calendarEventDeletionTombstones,
  STORAGE_KEYS.calendarGoogleDeletionTombstones,
  STORAGE_KEYS.calendarSharedAttendance,
  STORAGE_KEYS.calendarAllianceEventParticipants,
]);

const OFFLINE_PENDING_KEY = "baki-go:cloud-sync-pending-keys";

function persistOfflinePendingKeys(): void {
  if (typeof window === "undefined") return;
  const keys = [...pendingKeys];
  if (keys.length === 0) {
    window.localStorage.removeItem(OFFLINE_PENDING_KEY);
    return;
  }
  window.localStorage.setItem(OFFLINE_PENDING_KEY, JSON.stringify(keys.slice(0, 50)));
}

function restoreOfflinePendingKeys(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(OFFLINE_PENDING_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const key of parsed) {
      if (typeof key === "string" && isSyncableStorageKey(key)) {
        pendingKeys.add(key);
      }
    }
  } catch {
    /* ignore */
  }
}

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

export async function awaitPendingCloudSync(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  await runCloudPush();
  if (inFlightPushPromise) {
    await inFlightPushPromise;
  }
}

/** Test/helper: whether a network push is currently in flight. */
export function hasInFlightCloudPush(): boolean {
  return inFlightPushPromise != null;
}

function readSyncMemberId(): EntityId | null {
  const storage = pushSourceStorage ?? new LocalStorageAdapter();
  return createAuthRepository(storage).readSession()?.memberId ?? null;
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function scheduleCloudPush(key: string): void {
  if (cloudSyncPaused || !isSyncableStorageKey(key) || !isSupabaseConfigured()) {
    return;
  }

  pendingKeys.add(key);
  persistOfflinePendingKeys();

  if (!isOnline()) {
    return;
  }

  const immediate = IMMEDIATE_FLUSH_KEYS.has(key);

  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  if (immediate) {
    void runCloudPush();
    return;
  }

  pushTimer = setTimeout(() => {
    pushTimer = null;
    void runCloudPush();
  }, PUSH_DEBOUNCE_MS);
}

async function runCloudPush(): Promise<void> {
  // Coalesce concurrent callers onto the same in-flight request.
  if (inFlightPushPromise) {
    await inFlightPushPromise;
    if (pendingKeys.size === 0) {
      return;
    }
  }

  restoreOfflinePendingKeys();
  const memberId = readSyncMemberId();
  const inner = pushSourceStorage;
  if (!memberId || !inner || pendingKeys.size === 0 || cloudSyncPaused || !isSupabaseConfigured()) {
    return;
  }

  if (!isOnline()) {
    persistOfflinePendingKeys();
    return;
  }

  const keys = [...pendingKeys];
  pendingKeys.clear();
  persistOfflinePendingKeys();

  const entries = keys.flatMap((key) => {
    const rawValue = inner.getItem(key);
    if (!rawValue) {
      return [];
    }
    return [{ dataKey: key, rawValue }];
  });

  if (entries.length === 0) {
    return;
  }

  const pushWork = (async () => {
    try {
      await pushCloudAppDataKeys({ memberId, entries });
    } catch (error) {
      console.error("Cloud sync push failed:", error);
      keys.forEach((key) => pendingKeys.add(key));
      persistOfflinePendingKeys();
    }
  })();

  // Assign the request promise itself (not .finally()) so cleanup can match.
  inFlightPushPromise = pushWork;
  try {
    await pushWork;
  } finally {
    if (inFlightPushPromise === pushWork) {
      inFlightPushPromise = null;
    }
  }
}

export class SyncingStorageAdapter implements StorageAdapter {
  constructor(private readonly inner: StorageAdapter) {
    pushSourceStorage = inner;
    restoreOfflinePendingKeys();
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
