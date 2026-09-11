import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISPOSABLE_LOCAL_CACHE_KEYS,
  STORAGE_QUOTA_SOFT_USER_MESSAGE,
  isStorageQuotaError,
  reclaimDisposableLocalCaches,
  setLocalStorageItemWithQuotaRecovery,
  toStorageUserError,
} from "@/lib/repositories/storage-quota-error";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { loadSharedCalendarEvents, saveSharedCalendarCache } from "@/lib/calendar/shared-calendar-storage";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CalendarEvent } from "@/types/calendar-event";

class MemoryStorage implements StorageAdapter {
  store = new Map<string, string>();
  failKeys = new Set<string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failKeys.has(key)) {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe("isStorageQuotaError classification", () => {
  it("accepts QuotaExceededError", () => {
    expect(isStorageQuotaError(new DOMException("x", "QuotaExceededError"))).toBe(true);
  });

  it("rejects InvalidStateError / AbortError / UnknownError / generic Error", () => {
    expect(isStorageQuotaError(new DOMException("closed", "InvalidStateError"))).toBe(false);
    expect(isStorageQuotaError(new DOMException("aborted", "AbortError"))).toBe(false);
    expect(isStorageQuotaError(new DOMException("boom", "UnknownError"))).toBe(false);
    expect(isStorageQuotaError(new Error("transaction aborted"))).toBe(false);
    expect(isStorageQuotaError(new Error("database closed"))).toBe(false);
  });

  it("maps only quota errors to soft user message", () => {
    expect(toStorageUserError(new DOMException("q", "QuotaExceededError")).message).toBe(
      STORAGE_QUOTA_SOFT_USER_MESSAGE,
    );
    expect(toStorageUserError(new DOMException("q", "QuotaExceededError")).message).not.toContain(
      "清除瀏覽器網站資料",
    );
    expect(toStorageUserError(new Error("transaction aborted")).message).toBe("transaction aborted");
  });
});

describe("reclaimDisposableLocalCaches", () => {
  it("removes only disposable cache keys", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.sharedCalendarEvents, "[]");
    storage.setItem(STORAGE_KEYS.sharedCalendarCacheMeta, "{}");
    storage.setItem(STORAGE_KEYS.calendarReminderQueue, "[]");
    storage.setItem(STORAGE_KEYS.computedMetrics, "{}");
    storage.setItem(STORAGE_KEYS.calendarEvents, '[{"id":"keep"}]');
    storage.setItem(STORAGE_KEYS.authSession, '{"memberId":"m1"}');

    const removed = reclaimDisposableLocalCaches(storage);
    expect(removed).toBe(DISPOSABLE_LOCAL_CACHE_KEYS.length);
    expect(storage.getItem(STORAGE_KEYS.sharedCalendarEvents)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.calendarEvents)).toBe('[{"id":"keep"}]');
    expect(storage.getItem(STORAGE_KEYS.authSession)).toBe('{"memberId":"m1"}');
  });
});

describe("setLocalStorageItemWithQuotaRecovery", () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    let failNext = true;
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (failNext && key === "baki-go:test") {
            failNext = false;
            map.set(STORAGE_KEYS.sharedCalendarEvents, "big");
            throw new DOMException("QuotaExceededError", "QuotaExceededError");
          }
          map.set(key, value);
        },
        removeItem: (key: string) => {
          map.delete(key);
        },
      },
    });
  });

  it("reclaims disposable caches and retries once on quota", () => {
    expect(() => setLocalStorageItemWithQuotaRecovery("baki-go:test", "ok")).not.toThrow();
    expect(window.localStorage.getItem("baki-go:test")).toBe("ok");
    expect(window.localStorage.getItem(STORAGE_KEYS.sharedCalendarEvents)).toBeNull();
  });
});

describe("saveSharedCalendarCache non-blocking / no localStorage event blob", () => {
  it("keeps events in memory even when localStorage would quota on events key", () => {
    const storage = new MemoryStorage();
    storage.failKeys.add(STORAGE_KEYS.sharedCalendarEvents);

    const events: CalendarEvent[] = [
      {
        id: "shared:cal:1",
        createdAt: "2026-09-11T00:00:00.000Z",
        updatedAt: "2026-09-11T00:00:00.000Z",
        memberId: "m1",
        title: "教練課",
        startAt: "2026-09-12T15:00:00.000Z",
        endAt: "2026-09-12T16:00:00.000Z",
        allDay: false,
        color: "teal",
        recurrence: { frequency: "none", interval: 1 },
      },
    ];
    const ok = saveSharedCalendarCache(storage, events, {
      syncedDate: "2026-09-11",
      rangeStart: "2026-01-01",
      rangeEnd: "2026-12-31",
      memberId: "m1",
      syncedAt: "2026-09-11T00:00:00.000Z",
    });

    expect(ok).toBe(true);
    expect(storage.getItem(STORAGE_KEYS.sharedCalendarEvents)).toBeNull();
    expect(loadSharedCalendarEvents(storage, "m1")).toHaveLength(1);
  });
});
