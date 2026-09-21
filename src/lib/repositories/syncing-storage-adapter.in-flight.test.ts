import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

describe("SyncingStorageAdapter in-flight race (mocked network)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/cloud/cloud-app-data-service");
    vi.doUnmock("@/lib/supabase/client");
    vi.doUnmock("@/lib/repositories/auth-repository");
  });

  it("hasInFlightCloudPush true during request and false after settle", async () => {
    let resolvePush!: () => void;
    const network = new Promise<void>((resolve) => {
      resolvePush = resolve;
    });

    vi.doMock("@/lib/cloud/cloud-app-data-service", () => ({
      pushCloudAppDataKeys: vi.fn(() => network),
    }));
    vi.doMock("@/lib/supabase/client", () => ({
      isSupabaseConfigured: () => true,
    }));
    vi.doMock("@/lib/repositories/auth-repository", () => ({
      createAuthRepository: () => ({
        readSession: () => ({ memberId: "ffffffff-ffff-4fff-8fff-ffffffffffff" }),
      }),
    }));

    const mod = await import("@/lib/repositories/syncing-storage-adapter");
    const { STORAGE_KEYS } = await import("@/lib/repositories/storage-keys");
    mod.setCloudSyncPaused(false);

    const data = new Map<string, string>();
    const inner: StorageAdapter = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };

    const adapter = new mod.SyncingStorageAdapter(inner);
    adapter.setItem(STORAGE_KEYS.calendarSharedAttendance, JSON.stringify([{ ok: true }]));

    const wait = mod.awaitPendingCloudSync();
    await Promise.resolve();
    await Promise.resolve();
    expect(mod.hasInFlightCloudPush()).toBe(true);

    resolvePush();
    await wait;
    expect(mod.hasInFlightCloudPush()).toBe(false);
  });

  beforeEach(() => {
    vi.resetModules();
  });
});
