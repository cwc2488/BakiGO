import { describe, expect, it, beforeEach } from "vitest";
import {
  clearRangeCache,
  getRangeCacheSize,
  getRangeCachedEvents,
  makeRangeCacheKey,
  setRangeCachedEvents,
} from "@/lib/calendar/calendar-range-cache";
import {
  acquireSubscription,
  clearAllSubscriptions,
  getActiveSubscriptionCount,
} from "@/lib/calendar/calendar-subscription-registry";
import {
  hydrateCalendarStore,
  getCalendarStoreSnapshot,
  resetCalendarStore,
  upsertCalendarEvents,
  removeCalendarEventIds,
} from "@/lib/calendar/calendar-event-store";
import {
  enqueueCalendarPendingMutation,
  listCalendarPendingMutations,
  removeCalendarPendingMutation,
  clearCalendarPendingMutations,
} from "@/lib/calendar/calendar-pending-mutations";
import type { CalendarEvent } from "@/types/calendar-event";
import type { RealtimeChannel } from "@supabase/supabase-js";

function makeEvent(id: string, updatedAt: string): CalendarEvent {
  return {
    id,
    createdAt: updatedAt,
    updatedAt,
    memberId: "m1",
    title: `Event ${id}`,
    startAt: "2026-09-21T10:00:00",
    endAt: "2026-09-21T11:00:00",
    allDay: false,
    color: "green",
    recurrence: { frequency: "none", interval: 1 },
  };
}

describe("calendar range cache", () => {
  beforeEach(() => {
    clearRangeCache();
  });

  it("evicts oldest entries beyond max", () => {
    for (let i = 0; i < 8; i += 1) {
      const key = makeRangeCacheKey({
        memberId: "m1",
        rangeStart: `2026-0${(i % 9) + 1}-01`,
        rangeEnd: `2026-0${(i % 9) + 1}-28`,
      });
      setRangeCachedEvents(key, [makeEvent(`e${i}`, "2026-09-21T00:00:00.000Z")]);
    }
    expect(getRangeCacheSize()).toBeLessThanOrEqual(6);
  });

  it("returns cached events before TTL", () => {
    const key = makeRangeCacheKey({ memberId: "m1", rangeStart: "2026-09-01", rangeEnd: "2026-09-30" });
    setRangeCachedEvents(key, [makeEvent("a", "2026-09-21T00:00:00.000Z")]);
    expect(getRangeCachedEvents(key)?.[0]?.id).toBe("a");
  });
});

describe("calendar subscription registry", () => {
  beforeEach(() => {
    clearAllSubscriptions();
  });

  it("dedupes same key and releases once", () => {
    const fakeChannel = { unsubscribe: async () => "ok" } as unknown as RealtimeChannel;
    let starts = 0;
    const start = () => {
      starts += 1;
      return { channel: fakeChannel, cleanup: () => undefined };
    };
    const a = acquireSubscription("calendar:member:m1", start);
    const b = acquireSubscription("calendar:member:m1", start);
    expect(starts).toBe(1);
    expect(getActiveSubscriptionCount()).toBe(1);
    a();
    expect(getActiveSubscriptionCount()).toBe(1);
    b();
    expect(getActiveSubscriptionCount()).toBe(0);
  });
});

describe("calendar event store upsert", () => {
  beforeEach(() => {
    resetCalendarStore();
  });

  it("upserts by id without duplicating", () => {
    hydrateCalendarStore({
      memberId: "m1",
      events: [makeEvent("e1", "2026-09-21T00:00:00.000Z")],
    });
    upsertCalendarEvents([makeEvent("e1", "2026-09-21T01:00:00.000Z")]);
    const snap = getCalendarStoreSnapshot();
    expect(snap.events).toHaveLength(1);
    expect(snap.events[0].updatedAt).toBe("2026-09-21T01:00:00.000Z");
    removeCalendarEventIds(["e1"]);
    expect(getCalendarStoreSnapshot().events).toHaveLength(0);
  });
});

describe("calendar pending mutations", () => {
  beforeEach(() => {
    clearCalendarPendingMutations();
  });

  it("stores and clears pending ops", () => {
    const entry = enqueueCalendarPendingMutation({
      memberId: "m1",
      eventId: "e1",
      operation: "create",
      payload: null,
    });
    expect(listCalendarPendingMutations()).toHaveLength(1);
    removeCalendarPendingMutation(entry.operationId);
    expect(listCalendarPendingMutations()).toHaveLength(0);
  });
});
