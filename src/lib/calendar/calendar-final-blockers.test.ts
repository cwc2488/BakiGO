import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  enqueueCalendarPendingMutation,
  listCalendarPendingMutations,
  clearCalendarPendingMutations,
} from "@/lib/calendar/calendar-pending-mutations";
import {
  applyCalendarEventRealtimeChange,
  ensureVisiblePersonalCalendarRange,
  expandVisibleRangeWithBuffer,
  resetPersonalCalendarRangePullState,
} from "@/lib/calendar/calendar-cloud-sync";
import {
  getPersonalCalendarEventCount,
  getPersonalCalendarRangeCount,
  hydratePersonalCalendarRange,
  resetCalendarStore,
  CALENDAR_STORE_MAX_PERSONAL_RANGES,
  eventBelongsToActivePersonalRanges,
} from "@/lib/calendar/calendar-event-store";
import {
  awaitCalendarEventCloudWrites,
  resetCalendarEventCloudWriteTracker,
  trackCalendarEventCloudWrite,
} from "@/lib/calendar/calendar-event-cloud-write-tracker";
import { addDays } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/types/calendar-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

function makeEvent(overrides: Partial<CalendarEvent> & { id: string; memberId: string }): CalendarEvent {
  return {
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    title: `Event ${overrides.id}`,
    startAt: "2026-09-21T10:00:00",
    endAt: "2026-09-21T11:00:00",
    allDay: false,
    color: "green",
    recurrence: { frequency: "none", interval: 1 },
    ...overrides,
  };
}

describe("calendar final blockers", () => {
  beforeEach(() => {
    resetCalendarStore();
    clearCalendarPendingMutations();
    resetCalendarEventCloudWriteTracker();
    resetPersonalCalendarRangePullState();
  });

  it("migration 082 includes idempotent server-side backfill from member_app_data", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/082_calendar_events_v1.sql"),
      "utf8",
    );
    expect(sql).toContain("jsonb_array_elements");
    expect(sql).toContain("baki-go:calendar-events");
    expect(sql).toContain("mad.member_id");
    expect(sql).toContain("jsonb_build_object('memberId'");
    expect(sql).toContain("on conflict (member_id, id) do update");
    expect(sql).toContain("calendar_events backfill");
    expect(sql).toContain("source_count <> migrated_count");
    // Must not drop the legacy blob.
    expect(sql).not.toMatch(/delete\s+from\s+public\.member_app_data/i);
  });

  it("offline delete queue stores memberId and flushes without store lookup", async () => {
    const memberId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const eventId = "evt-delete-1";
    enqueueCalendarPendingMutation({
      memberId,
      eventId,
      operation: "delete",
      payload: null,
    });
    // Event is gone from store (already deleted locally).
    expect(getPersonalCalendarEventCount()).toBe(0);
    const queued = listCalendarPendingMutations();
    expect(queued).toHaveLength(1);
    expect(queued[0].memberId).toBe(memberId);
    expect(queued[0].payload).toBeNull();
  });

  it("online write failure inside tracker is not treated as silent success unless queued", async () => {
    await expect(
      trackCalendarEventCloudWrite("m", "e", "upsert", async () => {
        throw new Error("supabase_down");
      }).then(() => awaitCalendarEventCloudWrites()),
    ).rejects.toThrow(/supabase_down/);
  });

  it("online write failure that enqueues resolves await as queued-success path", async () => {
    const memberId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await trackCalendarEventCloudWrite(memberId, "e2", "upsert", async () => {
      try {
        throw new Error("network");
      } catch {
        enqueueCalendarPendingMutation({
          memberId,
          eventId: "e2",
          operation: "create",
          payload: makeEvent({ id: "e2", memberId }),
        });
      }
    });
    await expect(awaitCalendarEventCloudWrites()).resolves.toBeUndefined();
    expect(listCalendarPendingMutations()).toHaveLength(1);
  });

  it("realtime upsert outside active ranges does not grow memory", () => {
    const memberId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    hydratePersonalCalendarRange({
      memberId,
      rangeStart: "2026-09-01",
      rangeEnd: "2026-09-30",
      events: [makeEvent({ id: "in-range", memberId, startAt: "2026-09-10T10:00:00", endAt: "2026-09-10T11:00:00" })],
    });
    const far = makeEvent({
      id: "far",
      memberId,
      startAt: "2015-01-01T10:00:00",
      endAt: "2015-01-01T11:00:00",
      updatedAt: "2026-09-21T12:00:00.000Z",
    });
    expect(eventBelongsToActivePersonalRanges(far)).toBe(false);
    applyCalendarEventRealtimeChange({
      type: "INSERT",
      eventId: "far",
      event: far,
      updatedAt: far.updatedAt as string,
    });
    expect(getPersonalCalendarEventCount()).toBe(1);
  });

  it("navigating 6 months forward expands ranges with buffer and keeps LRU bound", async () => {
    const memberId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    let today = "2026-09-21";
    for (let i = 0; i < 6; i += 1) {
      const monthStart = addDays(today, i * 30);
      const monthEnd = addDays(monthStart, 27);
      const range = expandVisibleRangeWithBuffer({ rangeStart: monthStart, rangeEnd: monthEnd });
      hydratePersonalCalendarRange({
        memberId,
        rangeStart: range.rangeStart,
        rangeEnd: range.rangeEnd,
        events: [
          makeEvent({
            id: `nav-${i}`,
            memberId,
            startAt: `${monthStart}T10:00:00`,
            endAt: `${monthStart}T11:00:00`,
            updatedAt: new Date(Date.now() + i).toISOString(),
          }),
        ],
      });
    }
    expect(getPersonalCalendarRangeCount()).toBeLessThanOrEqual(CALENDAR_STORE_MAX_PERSONAL_RANGES);

    // ensureVisible without supabase configured returns cache/skip path
    const storage = new MemoryStorage();
    const result = await ensureVisiblePersonalCalendarRange({
      storage,
      memberId,
      rangeStart: "2027-03-01",
      rangeEnd: "2027-03-31",
    });
    expect(result.fromCache).toBe(true);
  });
});

describe("SyncingStorageAdapter in-flight with mocked network", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("clears inFlightPushPromise after mocked network settles", async () => {
    vi.resetModules();

    let resolvePush!: () => void;
    const pushPromise = new Promise<void>((resolve) => {
      resolvePush = resolve;
    });

    vi.doMock("@/lib/cloud/cloud-app-data-service", () => ({
      pushCloudAppDataKeys: vi.fn(() => pushPromise),
    }));
    vi.doMock("@/lib/supabase/client", () => ({
      isSupabaseConfigured: () => true,
    }));
    vi.doMock("@/lib/repositories/auth-repository", () => ({
      createAuthRepository: () => ({
        readSession: () => ({ memberId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }),
      }),
    }));
    vi.doMock("@/lib/cloud/syncable-storage-keys", async () => {
      const actual = await vi.importActual<typeof import("@/lib/cloud/syncable-storage-keys")>(
        "@/lib/cloud/syncable-storage-keys",
      );
      return actual;
    });

    const { SyncingStorageAdapter, hasInFlightCloudPush, awaitPendingCloudSync, setCloudSyncPaused } =
      await import("@/lib/repositories/syncing-storage-adapter");
    const { STORAGE_KEYS } = await import("@/lib/repositories/storage-keys");

    setCloudSyncPaused(false);
    const inner: StorageAdapter = {
      data: new Map<string, string>(),
      getItem(key: string) {
        return this.data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.data.set(key, value);
      },
      removeItem(key: string) {
        this.data.delete(key);
      },
    } as StorageAdapter & { data: Map<string, string> };
    (inner as unknown as { data: Map<string, string> }).data = new Map();
    Object.assign(inner, {
      data: new Map<string, string>(),
      getItem(key: string) {
        return (this as unknown as { data: Map<string, string> }).data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        (this as unknown as { data: Map<string, string> }).data.set(key, value);
      },
      removeItem(key: string) {
        (this as unknown as { data: Map<string, string> }).data.delete(key);
      },
    });

    const adapter = new SyncingStorageAdapter(inner);
    adapter.setItem(STORAGE_KEYS.calendarSharedAttendance, JSON.stringify([{ id: 1 }]));

    const pending = awaitPendingCloudSync();
    // Allow microtasks to enter runCloudPush
    await Promise.resolve();
    await Promise.resolve();
    expect(hasInFlightCloudPush()).toBe(true);
    resolvePush();
    await pending;
    expect(hasInFlightCloudPush()).toBe(false);
  });
});
