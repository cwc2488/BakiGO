import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import {
  boundSharedCalendarEventsForLocalCache,
  pruneCalendarEventDeletionTombstones,
  pruneCalendarGoogleDeletionTombstones,
  pruneCalendarLocalRetention,
  saveSharedCalendarCacheBounded,
  SHARED_CALENDAR_LOCAL_MAX_CHARS,
} from "@/lib/calendar/calendar-storage-bounds";
import type { CalendarEvent } from "@/types/calendar-event";

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

function makeEvent(id: string, startAt: string): CalendarEvent {
  return {
    id,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    memberId: "m1",
    title: `Event ${id}`,
    startAt,
    endAt: startAt,
    allDay: true,
    color: "green",
    recurrence: { frequency: "none", interval: 1 },
  };
}

describe("calendar storage bounds", () => {
  it("prunes tombstones older than max age and caps count", () => {
    const storage = new MemoryStorage();
    const now = new Date("2026-09-21T12:00:00.000Z");
    const items = [
      { eventId: "old", deletedAt: "2026-01-01T00:00:00.000Z" },
      ...Array.from({ length: 250 }, (_, i) => ({
        eventId: `e${i}`,
        deletedAt: new Date(now.getTime() - i * 60_000).toISOString(),
      })),
    ];
    storage.setItem(STORAGE_KEYS.calendarEventDeletionTombstones, JSON.stringify(items));

    const removed = pruneCalendarEventDeletionTombstones(storage, {
      now,
      maxAgeDays: 45,
      maxCount: 200,
    });
    expect(removed).toBeGreaterThan(0);

    const next = JSON.parse(
      storage.getItem(STORAGE_KEYS.calendarEventDeletionTombstones) ?? "[]",
    ) as Array<{ eventId: string }>;
    expect(next).toHaveLength(200);
    expect(next.some((item) => item.eventId === "old")).toBe(false);
  });

  it("prunes google deletion tombstones via local retention helper", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEYS.calendarGoogleDeletionTombstones,
      JSON.stringify([
        { eventId: "stale", deletedAt: "2020-01-01T00:00:00.000Z" },
        { eventId: "fresh", deletedAt: "2026-09-20T00:00:00.000Z" },
      ]),
    );
    pruneCalendarLocalRetention(storage);
    const next = JSON.parse(
      storage.getItem(STORAGE_KEYS.calendarGoogleDeletionTombstones) ?? "[]",
    ) as Array<{ eventId: string }>;
    expect(next.map((item) => item.eventId)).toEqual(["fresh"]);
  });

  it("bounds shared calendar events to char budget preferring near dates", () => {
    const events = [
      makeEvent("far", "2020-01-01T00:00:00"),
      makeEvent("near", "2026-09-21T00:00:00"),
      makeEvent("mid", "2026-06-01T00:00:00"),
    ];
    const bounded = boundSharedCalendarEventsForLocalCache(events, {
      maxChars: 280,
      referenceDate: "2026-09-21",
    });
    expect(bounded.some((event) => event.id === "near")).toBe(true);
    expect(JSON.stringify(bounded).length).toBeLessThanOrEqual(280);
  });

  it("saveSharedCalendarCacheBounded writes within budget", () => {
    const storage = new MemoryStorage();
    const events = Array.from({ length: 40 }, (_, i) =>
      makeEvent(`bulk-${i}`, `2026-${String((i % 12) + 1).padStart(2, "0")}-15T10:00:00`),
    );
    const written = saveSharedCalendarCacheBounded(storage, events, (bounded) => {
      storage.setItem(STORAGE_KEYS.sharedCalendarEvents, JSON.stringify(bounded));
    });
    const raw = storage.getItem(STORAGE_KEYS.sharedCalendarEvents) ?? "[]";
    expect(raw.length).toBeLessThanOrEqual(SHARED_CALENDAR_LOCAL_MAX_CHARS);
    expect(written.length).toBeGreaterThan(0);
    expect(written.length).toBeLessThanOrEqual(events.length);
  });

  it("pruneGoogle helper is idempotent when already within bounds", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEYS.calendarGoogleDeletionTombstones,
      JSON.stringify([{ eventId: "a", deletedAt: "2026-09-20T00:00:00.000Z" }]),
    );
    expect(pruneCalendarGoogleDeletionTombstones(storage, { now: new Date("2026-09-21") })).toBe(0);
  });
});
