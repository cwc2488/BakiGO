import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  awaitPendingCloudSync,
  flushPendingCloudSync,
  hasInFlightCloudPush,
  setCloudSyncPaused,
  SyncingStorageAdapter,
} from "@/lib/repositories/syncing-storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";

class MemoryStorage implements StorageAdapter {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe("SyncingStorageAdapter in-flight race", () => {
  beforeEach(() => {
    setCloudSyncPaused(false);
    vi.resetModules();
  });

  it("exports hasInFlightCloudPush helper", () => {
    expect(hasInFlightCloudPush()).toBe(false);
  });

  it("awaitPendingCloudSync resolves after in-flight push completes", async () => {
    // Without supabase configured, runCloudPush returns early — still must not throw.
    const inner = new MemoryStorage();
    const adapter = new SyncingStorageAdapter(inner);
    adapter.setItem(STORAGE_KEYS.calendarSharedAttendance, JSON.stringify([]));
    flushPendingCloudSync();
    await awaitPendingCloudSync();
    expect(hasInFlightCloudPush()).toBe(false);
  });
});
