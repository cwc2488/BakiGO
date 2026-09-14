import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  __setSharedCalendarIdbBackendForTests,
  type SharedCalendarIdbBackend,
} from "@/lib/calendar/shared-calendar-idb-cache";
import {
  SHARED_CALENDAR_FRESHNESS_MS,
  __resetSharedCalendarMemoryCacheForTests,
  getSharedCalendarMemoryCache,
  isSharedCalendarSnapshotFresh,
} from "@/lib/calendar/shared-calendar-session-cache";
import {
  hydrateSharedCalendarCache,
  isSharedCalendarCacheFresh,
  loadSharedCalendarEvents,
  saveSharedCalendarCache,
} from "@/lib/calendar/shared-calendar-storage";
import {
  __resetSharedCalendarSyncFlightForTests,
  syncSharedGoogleCalendars,
} from "@/lib/calendar/sync-shared-calendars";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CalendarEvent } from "@/types/calendar-event";

class MemoryStorage implements StorageAdapter {
  store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function event(id: string, title: string): CalendarEvent {
  return {
    id,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    memberId: "member-1",
    title,
    startAt: "2026-09-12T15:00:00.000Z",
    endAt: "2026-09-12T16:00:00.000Z",
    allDay: false,
    color: "teal",
    recurrence: { frequency: "none", interval: 1 },
  };
}

function createMemoryIdb(): SharedCalendarIdbBackend & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    async get(memberId) {
      return (map.get(memberId) as never) ?? null;
    },
    async set(snapshot) {
      map.set(snapshot.memberId, { ...snapshot, events: snapshot.events.slice() });
    },
    async delete(memberId) {
      map.delete(memberId);
    },
  };
}

function meta(syncedAt: string) {
  return {
    syncedDate: syncedAt.slice(0, 10),
    rangeStart: "2026-01-01",
    rangeEnd: "2026-12-31",
    memberId: "member-1",
    syncedAt,
  };
}

describe("shared calendar memory + IndexedDB cache", () => {
  let storage: MemoryStorage;
  let idb: ReturnType<typeof createMemoryIdb>;

  beforeEach(() => {
    storage = new MemoryStorage();
    idb = createMemoryIdb();
    __setSharedCalendarIdbBackendForTests(idb);
    __resetSharedCalendarMemoryCacheForTests();
    __resetSharedCalendarSyncFlightForTests();
  });

  afterEach(() => {
    __setSharedCalendarIdbBackendForTests(null);
    __resetSharedCalendarMemoryCacheForTests();
    __resetSharedCalendarSyncFlightForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Case A: save writes memory + IndexedDB and never stores event JSON in localStorage", async () => {
    saveSharedCalendarCache(storage, [event("shared:1", "教練課")], meta(new Date().toISOString()));
    expect(storage.getItem(STORAGE_KEYS.sharedCalendarEvents)).toBeNull();
    expect(getSharedCalendarMemoryCache("member-1")?.events).toHaveLength(1);
    await Promise.resolve();
    expect(idb.map.has("member-1")).toBe(true);
  });

  it("Case B/C: SPA remount uses memory — sync does not call API while fresh", async () => {
    saveSharedCalendarCache(storage, [event("shared:1", "教練課")], meta(new Date().toISOString()));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(isSharedCalendarCacheFresh(storage, "member-1")).toBe(true);
    const result = await syncSharedGoogleCalendars(
      storage,
      "member-1",
      "2026-01-01",
      "2026-12-31",
    );
    expect(result.fromCache).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Case D: cold start hydrates from IndexedDB before API", async () => {
    await idb.set({
      memberId: "member-1",
      events: [event("shared:idb", "從 IndexedDB")],
      syncedAt: new Date().toISOString(),
      rangeStart: "2026-01-01",
      rangeEnd: "2026-12-31",
      version: 1,
    });
    __resetSharedCalendarMemoryCacheForTests();

    const hydrated = await hydrateSharedCalendarCache(storage, "member-1");
    expect(hydrated?.events[0]?.title).toBe("從 IndexedDB");
    expect(loadSharedCalendarEvents(storage, "member-1")).toHaveLength(1);
  });

  it("Case E: freshness window uses syncedAt (30–60 minutes)", () => {
    const fresh = {
      memberId: "member-1",
      events: [event("shared:1", "x")],
      syncedAt: new Date().toISOString(),
      rangeStart: "a",
      rangeEnd: "b",
      version: 1,
    };
    expect(isSharedCalendarSnapshotFresh(fresh)).toBe(true);
    expect(
      isSharedCalendarSnapshotFresh({
        ...fresh,
        syncedAt: new Date(Date.now() - SHARED_CALENDAR_FRESHNESS_MS - 1000).toISOString(),
      }),
    ).toBe(false);
    expect(SHARED_CALENDAR_FRESHNESS_MS).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(SHARED_CALENDAR_FRESHNESS_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("Case F: stale cache triggers refresh and updates memory", async () => {
    saveSharedCalendarCache(
      storage,
      [event("shared:old", "舊資料")],
      meta(new Date(Date.now() - SHARED_CALENDAR_FRESHNESS_MS - 5000).toISOString()),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          calendars: [
            {
              calendarId: "cal",
              calendarName: "Shared",
              events: [
                {
                  uid: "new",
                  title: "新資料",
                  startAt: "2026-09-12T15:00:00.000Z",
                  endAt: "2026-09-12T16:00:00.000Z",
                  allDay: false,
                  color: "teal",
                  calendarId: "cal",
                  calendarName: "Shared",
                },
              ],
            },
          ],
        }),
      })),
    );

    const result = await syncSharedGoogleCalendars(
      storage,
      "member-1",
      "2026-01-01",
      "2026-12-31",
    );
    expect(result.fromCache).toBe(false);
    expect(result.events.some((row) => row.title === "新資料")).toBe(true);
  });

  it("Case G: API failure keeps existing cache and does not clear events", async () => {
    saveSharedCalendarCache(
      storage,
      [event("shared:keep", "保留")],
      meta(new Date(Date.now() - SHARED_CALENDAR_FRESHNESS_MS - 5000).toISOString()),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "boom" }),
      })),
    );

    const result = await syncSharedGoogleCalendars(
      storage,
      "member-1",
      "2026-01-01",
      "2026-12-31",
    );
    expect(result.fromCache).toBe(true);
    expect(result.events[0]?.title).toBe("保留");
    expect(loadSharedCalendarEvents(storage, "member-1")).toHaveLength(1);
  });

  it("Case H: IndexedDB failure still allows memory + API path", async () => {
    __setSharedCalendarIdbBackendForTests({
      async get() {
        throw new Error("idb down");
      },
      async set() {
        throw new Error("idb down");
      },
      async delete() {
        throw new Error("idb down");
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          calendars: [
            {
              calendarId: "cal",
              calendarName: "Shared",
              events: [
                {
                  uid: "ok",
                  title: "仍可用",
                  startAt: "2026-09-12T15:00:00.000Z",
                  endAt: "2026-09-12T16:00:00.000Z",
                  allDay: false,
                  color: "teal",
                  calendarId: "cal",
                  calendarName: "Shared",
                },
              ],
            },
          ],
        }),
      })),
    );

    const result = await syncSharedGoogleCalendars(
      storage,
      "member-1",
      "2026-01-01",
      "2026-12-31",
    );
    expect(result.fromCache).toBe(false);
    expect(result.events[0]?.title).toBe("仍可用");
    expect(getSharedCalendarMemoryCache("member-1")?.events).toHaveLength(1);
  });

  it("dedupes concurrent syncSharedGoogleCalendars into one fetch", async () => {
    const deferred: {
      resolve: ((value: unknown) => void) | null;
    } = { resolve: null };
    const fetchSpy = vi.fn(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const p1 = syncSharedGoogleCalendars(storage, "member-1", "2026-01-01", "2026-12-31");
    const p2 = syncSharedGoogleCalendars(storage, "member-1", "2026-01-01", "2026-12-31");
    // hydrateSharedCalendarCache awaits before fetch — wait until in-flight starts.
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    deferred.resolve?.({
      ok: true,
      json: async () => ({ calendars: [] }),
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.fromCache).toBe(false);
    expect(r2.fromCache).toBe(false);
  });

  it("migrates legacy localStorage event blob into memory/IDB then deletes blob", async () => {
    storage.setItem(
      STORAGE_KEYS.sharedCalendarEvents,
      JSON.stringify([event("shared:legacy", "舊 LS")]),
    );
    storage.setItem(
      STORAGE_KEYS.sharedCalendarCacheMeta,
      JSON.stringify(meta(new Date().toISOString())),
    );

    const hydrated = await hydrateSharedCalendarCache(storage, "member-1");
    expect(hydrated?.events[0]?.title).toBe("舊 LS");
    expect(storage.getItem(STORAGE_KEYS.sharedCalendarEvents)).toBeNull();
  });
});

describe("shared calendar cache wiring guards", () => {
  it("CalendarPage hydrates before optional API and keeps #66 cloud reload", () => {
    const page = readFileSync(resolve(process.cwd(), "src/components/calendar/CalendarPage.tsx"), "utf8");
    expect(page).toContain("hydrateSharedCalendarCache");
    expect(page).toContain("awaitCloudAuthBackgroundSync");
    expect(page).toContain("cloudSyncVersion");
    expect(page).toContain("reloadEvents()");
  });

  it("does not write shared event JSON to localStorage anymore", () => {
    const storageSrc = readFileSync(
      resolve(process.cwd(), "src/lib/calendar/shared-calendar-storage.ts"),
      "utf8",
    );
    expect(storageSrc).toContain("writeSharedCalendarIdbCache");
    expect(storageSrc).toContain("setSharedCalendarMemoryCache");
    expect(storageSrc).not.toMatch(/storage\.setItem\(\s*STORAGE_KEYS\.sharedCalendarEvents/);
  });
});
