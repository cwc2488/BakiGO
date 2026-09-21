/**
 * Regression: useSyncExternalStore requires getSnapshot to return a
 * referentially stable value when the store has not mutated.
 * Unstable snapshots caused CalendarPage infinite re-render → client crash.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  getCalendarStoreSnapshot,
  hydratePersonalCalendarRange,
  removeCalendarEventIds,
  replaceSharedCalendarEvents,
  resetCalendarStore,
  subscribeCalendarStore,
  upsertCalendarEvents,
} from "@/lib/calendar/calendar-event-store";
import type { CalendarEvent } from "@/types/calendar-event";

function makeEvent(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    memberId: "11111111-1111-4111-8111-111111111111",
    title: `Event ${overrides.id}`,
    startAt: "2026-09-21T10:00:00",
    endAt: "2026-09-21T11:00:00",
    allDay: false,
    color: "green",
    recurrence: { frequency: "none", interval: 1 },
    ...overrides,
  };
}

describe("calendar store snapshot stability (useSyncExternalStore)", () => {
  beforeEach(() => {
    resetCalendarStore();
  });

  it("returns the same snapshot reference when store is unchanged", () => {
    const a = getCalendarStoreSnapshot();
    const b = getCalendarStoreSnapshot();
    expect(a).toBe(b);
    expect(Object.is(a, b)).toBe(true);
  });

  it("changes snapshot reference after upsert", () => {
    const before = getCalendarStoreSnapshot();
    upsertCalendarEvents([makeEvent({ id: "e1" })]);
    const after = getCalendarStoreSnapshot();
    expect(before).not.toBe(after);
    expect(after.events).toHaveLength(1);
    // Still stable after mutation settles
    expect(getCalendarStoreSnapshot()).toBe(after);
  });

  it("changes snapshot reference after hydrate", () => {
    const before = getCalendarStoreSnapshot();
    hydratePersonalCalendarRange({
      memberId: "11111111-1111-4111-8111-111111111111",
      rangeStart: "2026-09-01",
      rangeEnd: "2026-09-30",
      events: [makeEvent({ id: "h1" })],
    });
    const after = getCalendarStoreSnapshot();
    expect(before).not.toBe(after);
    expect(after.personalRangeCount).toBeGreaterThan(0);
  });

  it("changes snapshot reference after remove", () => {
    upsertCalendarEvents([makeEvent({ id: "r1" })]);
    const before = getCalendarStoreSnapshot();
    removeCalendarEventIds(["r1"]);
    const after = getCalendarStoreSnapshot();
    expect(before).not.toBe(after);
    expect(after.events).toHaveLength(0);
  });

  it("changes snapshot reference after shared events replace", () => {
    const before = getCalendarStoreSnapshot();
    replaceSharedCalendarEvents([
      makeEvent({ id: "shared:1", memberId: "shared-cal" }),
    ]);
    const after = getCalendarStoreSnapshot();
    expect(before).not.toBe(after);
    expect(after.sharedEvents).toHaveLength(1);
  });

  it("notifies subscribers a finite number of times per mutation (no infinite loop)", () => {
    let calls = 0;
    const unsubscribe = subscribeCalendarStore(() => {
      calls += 1;
      // Mimic useSyncExternalStore: re-read snapshot on notify.
      // Must NOT schedule another emit from getSnapshot itself.
      const snap = getCalendarStoreSnapshot();
      void snap.events.length;
    });

    upsertCalendarEvents([makeEvent({ id: "loop-1" })]);
    expect(calls).toBe(1);

    upsertCalendarEvents([makeEvent({ id: "loop-2", updatedAt: "2026-09-21T12:00:00.000Z" })]);
    expect(calls).toBe(2);

    // Re-reading snapshot without mutation must not notify
    getCalendarStoreSnapshot();
    getCalendarStoreSnapshot();
    expect(calls).toBe(2);

    unsubscribe();
  });

  it("simulates React getSnapshot contract: identical consecutive reads between emits", () => {
    // React 19 warns / crashes when getSnapshot returns new refs each call
    // ("The result of getSnapshot should be cached").
    const reads: ReturnType<typeof getCalendarStoreSnapshot>[] = [];
    for (let i = 0; i < 50; i += 1) {
      reads.push(getCalendarStoreSnapshot());
    }
    expect(reads.every((snap) => snap === reads[0])).toBe(true);

    upsertCalendarEvents([makeEvent({ id: "react-1" })]);
    const afterMutation = getCalendarStoreSnapshot();
    expect(afterMutation).not.toBe(reads[0]);
    for (let i = 0; i < 50; i += 1) {
      expect(getCalendarStoreSnapshot()).toBe(afterMutation);
    }
  });
});
