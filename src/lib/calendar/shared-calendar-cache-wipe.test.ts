/**
 * Regression: shared calendar localStorage cache must never wipe
 * in-memory API results, and empty "fresh" cache must re-fetch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCalendarStoreSnapshot,
  replaceSharedCalendarEvents,
  resetCalendarStore,
} from "@/lib/calendar/calendar-event-store";
import {
  isSharedCalendarCacheFresh,
  loadSharedCalendarEvents,
  saveSharedCalendarCache,
  shouldApplySharedEventsFromLocalCache,
  shouldSkipSharedCalendarApiSync,
} from "@/lib/calendar/shared-calendar-storage";
import { syncSharedGoogleCalendars } from "@/lib/calendar/sync-shared-calendars";
import { getTodayDateString } from "@/lib/calendar/time-grid";
import type { CalendarEvent } from "@/types/calendar-event";
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

function makeSharedEvent(id: string): CalendarEvent {
  return {
    id,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    memberId: "member-1",
    title: `Shared ${id}`,
    startAt: "2026-10-15T10:00:00",
    endAt: "2026-10-15T11:00:00",
    allDay: false,
    color: "green",
    recurrence: { frequency: "none", interval: 1 },
    googleCalendarId: "shared-cal-1",
  };
}

describe("shared calendar cache wipe contracts", () => {
  beforeEach(() => {
    resetCalendarStore();
    vi.restoreAllMocks();
  });

  it("Contract A: empty local shared cache must not wipe API events already in the store", () => {
    const apiEvents = [makeSharedEvent("shared:api:1"), makeSharedEvent("shared:api:2")];
    replaceSharedCalendarEvents(apiEvents);
    expect(getCalendarStoreSnapshot().sharedEvents).toHaveLength(2);

    const storage = new MemoryStorage();
    // Simulate iPhone/PWA localStorage miss / write failure → empty cache
    expect(loadSharedCalendarEvents(storage)).toEqual([]);

    // Same guard used by CalendarPage.reloadEvents
    const cached = loadSharedCalendarEvents(storage);
    if (shouldApplySharedEventsFromLocalCache(cached)) {
      replaceSharedCalendarEvents(cached);
    }

    expect(getCalendarStoreSnapshot().sharedEvents).toHaveLength(2);
    expect(getCalendarStoreSnapshot().sharedEvents.map((e) => e.id)).toEqual([
      "shared:api:1",
      "shared:api:2",
    ]);
  });

  it("Contract A: non-empty local cache may still replace the store", () => {
    replaceSharedCalendarEvents([makeSharedEvent("shared:api:old")]);
    const storage = new MemoryStorage();
    const cachedEvents = [makeSharedEvent("shared:cache:1")];
    saveSharedCalendarCache(storage, cachedEvents, {
      syncedDate: getTodayDateString(),
      rangeStart: "2026-09-01",
      rangeEnd: "2026-11-01",
      memberId: "member-1",
      syncedAt: new Date().toISOString(),
    });

    const cached = loadSharedCalendarEvents(storage);
    if (shouldApplySharedEventsFromLocalCache(cached)) {
      replaceSharedCalendarEvents(cached);
    }

    expect(getCalendarStoreSnapshot().sharedEvents).toHaveLength(1);
    expect(getCalendarStoreSnapshot().sharedEvents[0]?.id).toBe("shared:cache:1");
  });

  it("Contract B: fresh metadata with empty events must not skip API sync", () => {
    const storage = new MemoryStorage();
    // Metadata says "synced today" but events blob is empty / missing
    storage.setItem(
      STORAGE_KEYS.sharedCalendarCacheMeta,
      JSON.stringify({
        syncedDate: getTodayDateString(),
        rangeStart: "2026-09-01",
        rangeEnd: "2026-11-01",
        memberId: "member-1",
        syncedAt: new Date().toISOString(),
      }),
    );
    storage.setItem(STORAGE_KEYS.sharedCalendarEvents, JSON.stringify([]));

    expect(isSharedCalendarCacheFresh(storage, "member-1")).toBe(true);
    expect(loadSharedCalendarEvents(storage)).toEqual([]);
    expect(shouldSkipSharedCalendarApiSync(storage, "member-1")).toBe(false);
  });

  it("Contract B: fresh metadata with events may skip API sync", () => {
    const storage = new MemoryStorage();
    saveSharedCalendarCache(storage, [makeSharedEvent("shared:cache:ok")], {
      syncedDate: getTodayDateString(),
      rangeStart: "2026-09-01",
      rangeEnd: "2026-11-01",
      memberId: "member-1",
      syncedAt: new Date().toISOString(),
    });

    expect(isSharedCalendarCacheFresh(storage, "member-1")).toBe(true);
    expect(loadSharedCalendarEvents(storage).length).toBeGreaterThan(0);
    expect(shouldSkipSharedCalendarApiSync(storage, "member-1")).toBe(true);
  });

  it("Contract B: syncSharedGoogleCalendars re-fetches when fresh cache is empty", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEYS.sharedCalendarCacheMeta,
      JSON.stringify({
        syncedDate: getTodayDateString(),
        rangeStart: "2026-09-01",
        rangeEnd: "2026-11-01",
        memberId: "member-1",
        syncedAt: new Date().toISOString(),
      }),
    );
    storage.setItem(STORAGE_KEYS.sharedCalendarEvents, JSON.stringify([]));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        calendars: [
          {
            calendarId: "herbalife-cal",
            calendarName: "Herbalife",
            events: [
              {
                uid: "evt-1",
                title: "Herbalife Meeting",
                startAt: "2026-10-15T10:00:00",
                endAt: "2026-10-15T11:00:00",
                allDay: false,
                calendarId: "herbalife-cal",
                calendarName: "Herbalife",
                color: "green",
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncSharedGoogleCalendars(
      storage,
      "member-1",
      "2026-09-15",
      "2026-10-31",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.fromCache).toBe(false);
    expect(result.count).toBe(1);
    expect(result.events[0]?.title).toBe("Herbalife Meeting");
  });
});
