import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  DISPOSABLE_LOCAL_CACHE_KEYS,
  STORAGE_QUOTA_SOFT_USER_MESSAGE,
  isStorageQuotaError,
  reclaimDisposableLocalCaches,
  setLocalStorageItemWithQuotaRecovery,
  toStorageUserError,
} from "@/lib/repositories/storage-quota-error";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { saveSharedCalendarCache } from "@/lib/calendar/shared-calendar-storage";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CalendarEvent } from "@/types/calendar-event";

class MemoryStorage implements StorageAdapter {
  store = new Map<string, string>();
  failKeys = new Set<string>();
  failAlways = false;

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failAlways || this.failKeys.has(key)) {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function makeSharedEvent(id: string): CalendarEvent {
  return {
    id: `shared:cal:${id}`,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    memberId: "m1",
    title: `Shared ${id}`,
    startAt: "2026-09-21T10:00:00",
    endAt: "2026-09-21T11:00:00",
    allDay: false,
    color: "blue",
    recurrence: { frequency: "none", interval: 1 },
    googleCalendarId: "shared-cal",
    googleEventId: id,
  };
}

describe("isStorageQuotaError classification", () => {
  it("accepts QuotaExceededError and NS_ERROR_DOM_QUOTA_REACHED", () => {
    expect(isStorageQuotaError(new DOMException("x", "QuotaExceededError"))).toBe(true);
    expect(isStorageQuotaError(new DOMException("x", "NS_ERROR_DOM_QUOTA_REACHED"))).toBe(true);
  });

  it("rejects InvalidStateError / AbortError / UnknownError / generic Error", () => {
    expect(isStorageQuotaError(new DOMException("closed", "InvalidStateError"))).toBe(false);
    expect(isStorageQuotaError(new DOMException("aborted", "AbortError"))).toBe(false);
    expect(isStorageQuotaError(new DOMException("boom", "UnknownError"))).toBe(false);
    expect(isStorageQuotaError(new Error("transaction aborted"))).toBe(false);
    expect(isStorageQuotaError(new Error("database closed"))).toBe(false);
  });

  it("maps only quota errors to soft user message without wipe-site copy", () => {
    expect(toStorageUserError(new DOMException("q", "QuotaExceededError")).message).toBe(
      STORAGE_QUOTA_SOFT_USER_MESSAGE,
    );
    expect(toStorageUserError(new DOMException("q", "QuotaExceededError")).message).not.toContain(
      "清除瀏覽器網站資料",
    );
    expect(toStorageUserError(new DOMException("q", "QuotaExceededError")).message).not.toContain(
      "本機儲存空間不足，請清除",
    );
    expect(toStorageUserError(new Error("transaction aborted")).message).toBe("transaction aborted");
  });
});

describe("reclaimDisposableLocalCaches", () => {
  it("removes only disposable cache keys — never auth/personal/customer data", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.sharedCalendarEvents, "[]");
    storage.setItem(STORAGE_KEYS.sharedCalendarCacheMeta, "{}");
    storage.setItem(STORAGE_KEYS.calendarReminderQueue, "[]");
    storage.setItem(STORAGE_KEYS.computedMetrics, "{}");
    storage.setItem(STORAGE_KEYS.calendarEvents, '[{"id":"keep"}]');
    storage.setItem(STORAGE_KEYS.calendarEventsLocalMirror, '[{"id":"mirror"}]');
    storage.setItem(STORAGE_KEYS.authSession, '{"memberId":"m1"}');
    storage.setItem(STORAGE_KEYS.customers, '[{"id":"c1"}]');
    storage.setItem("baki-go:calendar-pending-mutations", '[{"id":"p1"}]');

    const removed = reclaimDisposableLocalCaches(storage);
    expect(removed).toBe(DISPOSABLE_LOCAL_CACHE_KEYS.length);
    expect(storage.getItem(STORAGE_KEYS.sharedCalendarEvents)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.sharedCalendarCacheMeta)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.calendarReminderQueue)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.computedMetrics)).toBeNull();

    expect(storage.getItem(STORAGE_KEYS.calendarEvents)).toBe('[{"id":"keep"}]');
    expect(storage.getItem(STORAGE_KEYS.calendarEventsLocalMirror)).toBe('[{"id":"mirror"}]');
    expect(storage.getItem(STORAGE_KEYS.authSession)).toBe('{"memberId":"m1"}');
    expect(storage.getItem(STORAGE_KEYS.customers)).toBe('[{"id":"c1"}]');
    expect(storage.getItem("baki-go:calendar-pending-mutations")).toBe('[{"id":"p1"}]');
  });
});

describe("setLocalStorageItemWithQuotaRecovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reclaims disposable caches and retries once on quota — no user error", () => {
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

    expect(() => setLocalStorageItemWithQuotaRecovery("baki-go:test", "ok")).not.toThrow();
    expect(window.localStorage.getItem("baki-go:test")).toBe("ok");
    expect(window.localStorage.getItem(STORAGE_KEYS.sharedCalendarEvents)).toBeNull();
  });

  it("retry still fails → soft message only (no wipe-site copy)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("QuotaExceededError", "QuotaExceededError");
        },
        removeItem: () => undefined,
      },
    });

    expect(() => setLocalStorageItemWithQuotaRecovery("baki-go:test", "x")).toThrow(
      STORAGE_QUOTA_SOFT_USER_MESSAGE,
    );
    try {
      setLocalStorageItemWithQuotaRecovery("baki-go:test", "x");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("清除瀏覽器網站資料");
    }
  });
});

describe("saveSharedCalendarCache non-blocking", () => {
  it("returns false on quota and does not throw — caller keeps events", () => {
    const storage = new MemoryStorage();
    storage.failKeys.add(STORAGE_KEYS.sharedCalendarEvents);

    const events = [makeSharedEvent("1")];
    const ok = saveSharedCalendarCache(storage, events, {
      syncedDate: "2026-09-21",
      rangeStart: "2026-08-01",
      rangeEnd: "2026-11-01",
      memberId: "m1",
      syncedAt: "2026-09-21T00:00:00.000Z",
    });

    expect(ok).toBe(false);
    expect(events).toHaveLength(1);
    expect(storage.getItem(STORAGE_KEYS.sharedCalendarEvents)).toBeNull();
  });
});

describe("syncSharedGoogleCalendars with localStorage quota", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("server fetch success + localStorage quota → sync still resolves with events", async () => {
    const storage = new MemoryStorage();
    storage.failAlways = true;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          calendars: [
            {
              calendarId: "shared-cal",
              calendarName: "Shared",
              events: [
                {
                  uid: "ev1",
                  title: "Team meeting",
                  startAt: "2026-09-21T10:00:00",
                  endAt: "2026-09-21T11:00:00",
                  allDay: false,
                  calendarId: "shared-cal",
                  calendarName: "Shared",
                  color: "blue",
                },
              ],
            },
          ],
        }),
      })),
    );

    const { syncSharedGoogleCalendars } = await import("@/lib/calendar/sync-shared-calendars");
    const result = await syncSharedGoogleCalendars(
      storage,
      "11111111-1111-4111-8111-111111111111",
      "2026-08-01",
      "2026-11-01",
      { force: true },
    );

    expect(result.fromCache).toBe(false);
    expect(result.count).toBeGreaterThan(0);
    expect(result.events[0]?.title).toBe("Team meeting");
  });
});
