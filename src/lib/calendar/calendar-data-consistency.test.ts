import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  decideLegacyCalendarMerge,
} from "@/lib/cloud/calendar-events-cloud-service";
import {
  applyCalendarEventRealtimeChange,
  applyRemoteCalendarEventToStore,
  calendarPersistStatusMessage,
  ensureVisiblePersonalCalendarRange,
  expandVisibleRangeWithBuffer,
  flushCalendarPendingMutationQueue,
  resetPersonalCalendarRangePullState,
} from "@/lib/calendar/calendar-cloud-sync";
import {
  clearCalendarPendingMutations,
  enqueueCalendarPendingMutation,
  listCalendarPendingMutations,
} from "@/lib/calendar/calendar-pending-mutations";
import {
  getCalendarStoreSnapshot,
  getPersonalCalendarEventCount,
  hydratePersonalCalendarRange,
  resetCalendarStore,
} from "@/lib/calendar/calendar-event-store";
import { resetCalendarEventCloudWriteTracker } from "@/lib/calendar/calendar-event-cloud-write-tracker";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
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

describe("legacy merge decision", () => {
  it("skips when local is older than cloud", () => {
    expect(
      decideLegacyCalendarMerge({
        localUpdatedAt: "2026-09-15T00:00:00.000Z",
        cloud: { updated_at: "2026-09-21T00:00:00.000Z", deleted_at: null },
      }),
    ).toBe("skip");
  });

  it("updates when local is newer than cloud", () => {
    expect(
      decideLegacyCalendarMerge({
        localUpdatedAt: "2026-09-21T00:00:00.000Z",
        cloud: { updated_at: "2026-09-15T00:00:00.000Z", deleted_at: null },
      }),
    ).toBe("update");
  });

  it("never resurrects soft-deleted cloud events", () => {
    expect(
      decideLegacyCalendarMerge({
        localUpdatedAt: "2026-09-22T00:00:00.000Z",
        cloud: { updated_at: "2026-09-15T00:00:00.000Z", deleted_at: "2026-09-20T00:00:00.000Z" },
      }),
    ).toBe("skip");
  });

  it("inserts when cloud row is missing", () => {
    expect(
      decideLegacyCalendarMerge({
        localUpdatedAt: "2026-09-21T00:00:00.000Z",
        cloud: null,
      }),
    ).toBe("insert");
  });

  it("082 backfill only updates when cloud updated_at is older", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/082_calendar_events_v1.sql"),
      "utf8",
    );
    expect(sql).toContain("and public.calendar_events.updated_at < excluded.updated_at");
    expect(sql).not.toContain("payload is distinct from excluded.payload");
  });

  it("083 cutover reconcile function exists", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/083_calendar_events_legacy_reconcile.sql"),
      "utf8",
    );
    expect(sql).toContain("reconcile_calendar_events_from_legacy_blobs");
    expect(sql).toContain("ce.updated_at < n.updated_at");
    expect(sql).toContain("ce.deleted_at is null");
  });
});

describe("realtime moved-out / moved-in", () => {
  beforeEach(() => {
    resetCalendarStore();
  });

  it("removes store event when UPDATE moves it out of active range", () => {
    const memberId = "11111111-1111-4111-8111-111111111111";
    hydratePersonalCalendarRange({
      memberId,
      rangeStart: "2026-09-01",
      rangeEnd: "2026-09-30",
      events: [
        makeEvent({
          id: "X",
          memberId,
          startAt: "2026-09-25T10:00:00",
          endAt: "2026-09-25T11:00:00",
        }),
      ],
    });
    expect(getPersonalCalendarEventCount()).toBe(1);

    applyCalendarEventRealtimeChange({
      type: "UPDATE",
      eventId: "X",
      updatedAt: "2026-09-21T12:00:00.000Z",
      event: makeEvent({
        id: "X",
        memberId,
        startAt: "2026-10-25T10:00:00",
        endAt: "2026-10-25T11:00:00",
        updatedAt: "2026-09-21T12:00:00.000Z",
      }),
    });
    expect(getPersonalCalendarEventCount()).toBe(0);
  });

  it("inserts into store when UPDATE moves event into active range", () => {
    const memberId = "22222222-2222-4222-8222-222222222222";
    hydratePersonalCalendarRange({
      memberId,
      rangeStart: "2026-09-01",
      rangeEnd: "2026-09-30",
      events: [],
    });
    applyRemoteCalendarEventToStore(
      makeEvent({
        id: "X",
        memberId,
        startAt: "2026-09-12T10:00:00",
        endAt: "2026-09-12T11:00:00",
        updatedAt: "2026-09-21T12:00:00.000Z",
      }),
    );
    expect(getCalendarStoreSnapshot().events.map((e) => e.id)).toEqual(["X"]);
  });
});

describe("persist status messaging", () => {
  it("distinguishes saved vs queued", () => {
    expect(calendarPersistStatusMessage("create", "saved")).toBe("行程已新增");
    expect(calendarPersistStatusMessage("update", "queued")).toBe("行程已儲存，等待網路同步");
    expect(calendarPersistStatusMessage("delete", "queued")).toBe("行程已刪除，等待網路同步");
  });
});

describe("offline delete flush integration", () => {
  beforeEach(() => {
    resetCalendarStore();
    clearCalendarPendingMutations();
    resetCalendarEventCloudWriteTracker();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/cloud/calendar-events-cloud-service");
    vi.doUnmock("@/lib/supabase/client");
    vi.resetModules();
  });

  it("flush calls softDeleteCloudCalendarEvent with memberId and clears queue", async () => {
    const softDelete = vi.fn(async () => undefined);
    vi.doMock("@/lib/supabase/client", () => ({
      isSupabaseConfigured: () => true,
      createSupabaseBrowserClient: () => ({}),
    }));
    vi.doMock("@/lib/cloud/calendar-events-cloud-service", async () => {
      const actual = await vi.importActual<typeof import("@/lib/cloud/calendar-events-cloud-service")>(
        "@/lib/cloud/calendar-events-cloud-service",
      );
      return {
        ...actual,
        softDeleteCloudCalendarEvent: softDelete,
        upsertCloudCalendarEvent: vi.fn(),
      };
    });

    const {
      flushCalendarPendingMutationQueue: flush,
    } = await import("@/lib/calendar/calendar-cloud-sync");
    const { enqueueCalendarPendingMutation: enqueue, listCalendarPendingMutations: list } =
      await import("@/lib/calendar/calendar-pending-mutations");

    const memberId = "33333333-3333-4333-8333-333333333333";
    const eventId = "del-1";
    enqueue({ memberId, eventId, operation: "delete", payload: null });
    expect(list()).toHaveLength(1);

    await flush(new MemoryStorage());
    expect(softDelete).toHaveBeenCalledWith({ memberId, eventId });
    expect(list()).toHaveLength(0);
  });

  it("cloud failure keeps queue and bumps retryCount", async () => {
    vi.doMock("@/lib/supabase/client", () => ({
      isSupabaseConfigured: () => true,
      createSupabaseBrowserClient: () => ({}),
    }));
    vi.doMock("@/lib/cloud/calendar-events-cloud-service", async () => {
      const actual = await vi.importActual<typeof import("@/lib/cloud/calendar-events-cloud-service")>(
        "@/lib/cloud/calendar-events-cloud-service",
      );
      return {
        ...actual,
        softDeleteCloudCalendarEvent: vi.fn(async () => {
          throw new Error("cloud_down");
        }),
      };
    });

    const { flushCalendarPendingMutationQueue: flush } = await import("@/lib/calendar/calendar-cloud-sync");
    const {
      enqueueCalendarPendingMutation: enqueue,
      listCalendarPendingMutations: list,
      clearCalendarPendingMutations: clear,
    } = await import("@/lib/calendar/calendar-pending-mutations");
    clear();

    const memberId = "44444444-4444-4444-8444-444444444444";
    enqueue({ memberId, eventId: "del-2", operation: "delete", payload: null });
    await flush(new MemoryStorage());
    const remaining = list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].retryCount).toBeGreaterThanOrEqual(1);
  });

  it("repository offline delete enqueues memberId then flush soft-deletes", async () => {
    const softDelete = vi.fn(async () => undefined);
    vi.doMock("@/lib/supabase/client", () => ({
      isSupabaseConfigured: () => true,
      createSupabaseBrowserClient: () => ({}),
    }));
    vi.doMock("@/lib/cloud/cloud-member-ids", () => ({
      isCloudDatabaseMemberId: () => true,
    }));
    vi.doMock("@/lib/cloud/calendar-events-cloud-service", async () => {
      const actual = await vi.importActual<typeof import("@/lib/cloud/calendar-events-cloud-service")>(
        "@/lib/cloud/calendar-events-cloud-service",
      );
      return {
        ...actual,
        softDeleteCloudCalendarEvent: softDelete,
        upsertCloudCalendarEvent: vi.fn(async () => undefined),
      };
    });

    vi.stubGlobal("navigator", { onLine: false });
    const { createCalendarEventRepository: createRepo } = await import(
      "@/lib/repositories/calendar-event-repository"
    );
    const {
      flushCalendarPendingMutationQueue: flush,
    } = await import("@/lib/calendar/calendar-cloud-sync");
    const {
      listCalendarPendingMutations: list,
      clearCalendarPendingMutations: clear,
    } = await import("@/lib/calendar/calendar-pending-mutations");
    clear();

    const memberId = "55555555-5555-4555-8555-555555555555";
    const storage = new MemoryStorage();
    const repo = createRepo(storage);
    const created = repo.create({
      memberId,
      title: "temp",
      startAt: "2026-09-21T10:00:00",
      endAt: "2026-09-21T11:00:00",
      color: "green",
    });
    // create while offline also queues; clear to isolate delete
    clear();
    repo.delete(created.id);
    const queued = list();
    expect(queued.some((item) => item.operation === "delete" && item.memberId === memberId && item.eventId === created.id)).toBe(
      true,
    );

    vi.stubGlobal("navigator", { onLine: true });
    await flush(storage);
    expect(softDelete).toHaveBeenCalledWith({ memberId, eventId: created.id });
    expect(list()).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe("visible range cloud query", () => {
  beforeEach(() => {
    resetCalendarStore();
    resetPersonalCalendarRangePullState();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/cloud/calendar-events-cloud-service");
    vi.doUnmock("@/lib/supabase/client");
    vi.doUnmock("@/lib/cloud/cloud-member-ids");
    vi.resetModules();
  });

  it("navigating to 2027-03 queries that range and hydrates the event; fresh range skips requery", async () => {
    const memberId = "66666666-6666-4666-8666-666666666666";
    const fetchRange = vi.fn(async (input: { rangeStart: string; rangeEnd: string }) => {
      expect(input.rangeStart <= "2027-03-01").toBe(true);
      expect(input.rangeEnd >= "2027-03-31").toBe(true);
      return [
        makeEvent({
          id: "mar-2027",
          memberId,
          startAt: "2027-03-15T10:00:00",
          endAt: "2027-03-15T11:00:00",
          updatedAt: "2027-03-01T00:00:00.000Z",
        }),
      ];
    });

    vi.doMock("@/lib/supabase/client", () => ({
      isSupabaseConfigured: () => true,
      createSupabaseBrowserClient: () => ({}),
    }));
    vi.doMock("@/lib/cloud/cloud-member-ids", () => ({
      isCloudDatabaseMemberId: () => true,
    }));
    vi.doMock("@/lib/cloud/calendar-events-cloud-service", async () => {
      const actual = await vi.importActual<typeof import("@/lib/cloud/calendar-events-cloud-service")>(
        "@/lib/cloud/calendar-events-cloud-service",
      );
      return {
        ...actual,
        fetchCloudCalendarEventsInRange: fetchRange,
      };
    });

    const {
      ensureVisiblePersonalCalendarRange: ensure,
      expandVisibleRangeWithBuffer: expand,
      resetPersonalCalendarRangePullState: resetPull,
    } = await import("@/lib/calendar/calendar-cloud-sync");
    const { getCalendarStoreSnapshot: snap } = await import("@/lib/calendar/calendar-event-store");
    resetPull();

    const range = expand({ rangeStart: "2027-03-01", rangeEnd: "2027-03-31" });
    const storage = new MemoryStorage();
    const first = await ensure({
      storage,
      memberId,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    });
    expect(first.fromCache).toBe(false);
    expect(fetchRange).toHaveBeenCalledTimes(1);
    expect(snap().events.some((e) => e.id === "mar-2027")).toBe(true);

    const second = await ensure({
      storage,
      memberId,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    });
    expect(second.fromCache).toBe(true);
    expect(fetchRange).toHaveBeenCalledTimes(1);
  });

  it("expired range TTL triggers a new cloud query", async () => {
    const memberId = "77777777-7777-4777-8777-777777777777";
    const fetchRange = vi.fn(async () => [
      makeEvent({
        id: "ttl",
        memberId,
        startAt: "2027-04-10T10:00:00",
        endAt: "2027-04-10T11:00:00",
      }),
    ]);

    vi.doMock("@/lib/supabase/client", () => ({
      isSupabaseConfigured: () => true,
      createSupabaseBrowserClient: () => ({}),
    }));
    vi.doMock("@/lib/cloud/cloud-member-ids", () => ({
      isCloudDatabaseMemberId: () => true,
    }));
    vi.doMock("@/lib/cloud/calendar-events-cloud-service", async () => {
      const actual = await vi.importActual<typeof import("@/lib/cloud/calendar-events-cloud-service")>(
        "@/lib/cloud/calendar-events-cloud-service",
      );
      return { ...actual, fetchCloudCalendarEventsInRange: fetchRange };
    });

    const sync = await import("@/lib/calendar/calendar-cloud-sync");
    const store = await import("@/lib/calendar/calendar-event-store");
    sync.resetPersonalCalendarRangePullState();

    const range = sync.expandVisibleRangeWithBuffer({
      rangeStart: "2027-04-01",
      rangeEnd: "2027-04-30",
    });
    const storage = new MemoryStorage();
    await sync.ensureVisiblePersonalCalendarRange({
      storage,
      memberId,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    });
    expect(fetchRange).toHaveBeenCalledTimes(1);

    // Force TTL expiry by re-hydrating with past expiresAt via direct range replace after time warp.
    // isPersonalCalendarRangeFresh uses Date.now(); stub clock beyond TTL.
    const realNow = Date.now;
    Date.now = () => realNow() + store.CALENDAR_STORE_RANGE_TTL_MS + 1_000;
    try {
      await sync.ensureVisiblePersonalCalendarRange({
        storage,
        memberId,
        rangeStart: range.rangeStart,
        rangeEnd: range.rangeEnd,
      });
    } finally {
      Date.now = realNow;
    }
    expect(fetchRange).toHaveBeenCalledTimes(2);
  });
});
