import { describe, expect, it } from "vitest";
import {
  assertCustomerOwnedByMember,
  eventHasParticipant,
  listLinkableUpcomingEvents,
  listUpcomingEventsForCustomer,
  resolveParticipantCustomers,
  stripCustomerFromAllEvents,
  uniqueCustomerIds,
  withParticipantAdded,
  withParticipantRemoved,
} from "./calendar-event-participants";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { defaultRecurrence } from "./recurrence";
import type { CalendarEvent } from "@/types/calendar-event";
import type { Customer } from "@/types/customer";

class MemoryStorageAdapter implements StorageAdapter {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const OWNER = "member-owner-1";
const OTHER = "member-other-2";
const CUSTOMER_A = "cust-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CUSTOMER_B = "cust-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function baseEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    memberId: OWNER,
    title: "諮詢 · 王小明",
    startAt: "2026-09-10T10:00",
    endAt: "2026-09-10T11:00",
    allDay: false,
    color: "purple",
    recurrence: defaultRecurrence(),
    activityTypeKey: "consultation",
    ...overrides,
  };
}

function customer(id: string, ownerMemberId = OWNER): Customer {
  return {
    id,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ownerMemberId,
    displayName: id === CUSTOMER_A ? "王小明" : "陳美玲",
    status: "active",
  };
}

describe("calendar-event-participants", () => {
  it("dedupes participant ids", () => {
    expect(uniqueCustomerIds([CUSTOMER_A, CUSTOMER_A, CUSTOMER_B, ""])).toEqual([
      CUSTOMER_A,
      CUSTOMER_B,
    ]);
  });

  it("adds and removes participants without duplicates", () => {
    const first = withParticipantAdded(baseEvent(), CUSTOMER_A);
    const second = withParticipantAdded(first, CUSTOMER_A);
    expect(second.participantCustomerIds).toEqual([CUSTOMER_A]);
    const removed = withParticipantRemoved(second, CUSTOMER_A);
    expect(removed.participantCustomerIds).toBeUndefined();
    expect(eventHasParticipant(removed, CUSTOMER_A)).toBe(false);
  });

  it("lists upcoming linked events chronologically for a customer", () => {
    const events = [
      baseEvent({
        id: "later",
        startAt: "2026-09-20T09:00",
        endAt: "2026-09-20T10:00",
        participantCustomerIds: [CUSTOMER_A],
      }),
      baseEvent({
        id: "sooner",
        startAt: "2026-09-12T09:00",
        endAt: "2026-09-12T10:00",
        participantCustomerIds: [CUSTOMER_A],
      }),
      baseEvent({
        id: "other",
        participantCustomerIds: [CUSTOMER_B],
      }),
    ];
    const linked = listUpcomingEventsForCustomer(events, CUSTOMER_A, "2026-09-01T08:00");
    expect(linked.map((row) => row.eventId)).toEqual(["sooner", "later"]);
    expect(linked[0].categoryLabel).toBe("諮詢");
  });

  it("excludes already-linked events from the picker list", () => {
    const events = [
      baseEvent({ id: "linked", participantCustomerIds: [CUSTOMER_A] }),
      baseEvent({ id: "free", title: "會議" }),
    ];
    const linkable = listLinkableUpcomingEvents(events, CUSTOMER_A, "2026-09-01T08:00");
    expect(linkable.map((row) => row.eventId)).toEqual(["free"]);
  });

  it("resolves participant customers and rejects unauthorized owners", () => {
    const customers = [customer(CUSTOMER_A), customer(CUSTOMER_B, OTHER)];
    const resolved = resolveParticipantCustomers([CUSTOMER_A, CUSTOMER_B], customers);
    expect(resolved.map((c) => c.id)).toEqual([CUSTOMER_A, CUSTOMER_B]);
    expect(assertCustomerOwnedByMember(customers[0], OWNER)).toBe(true);
    expect(assertCustomerOwnedByMember(customers[1], OWNER)).toBe(false);
  });

  it("strips a customer from all events on delete", () => {
    const events = [
      baseEvent({ id: "e1", participantCustomerIds: [CUSTOMER_A, CUSTOMER_B] }),
      baseEvent({ id: "e2", participantCustomerIds: [CUSTOMER_A] }),
    ];
    const next = stripCustomerFromAllEvents(events, CUSTOMER_A);
    expect(next[0].participantCustomerIds).toEqual([CUSTOMER_B]);
    expect(next[1].participantCustomerIds).toBeUndefined();
  });

  it("repository enforces bidirectional sync and duplicate prevention", () => {
    const storage = new MemoryStorageAdapter();
    const repo = createCalendarEventRepository(storage);
    const created = repo.create({
      memberId: OWNER,
      title: "教練課",
      startAt: "2026-09-15T14:00",
      endAt: "2026-09-15T15:00",
      color: "orange",
      activityTypeKey: "coach_class",
      participantCustomerIds: [CUSTOMER_A],
    });
    expect(created.participantCustomerIds).toEqual([CUSTOMER_A]);

    repo.addParticipant(created.id, CUSTOMER_A);
    repo.addParticipant(created.id, CUSTOMER_B);
    const after = repo.getById(created.id)!;
    expect(after.participantCustomerIds).toEqual([CUSTOMER_A, CUSTOMER_B]);

    repo.removeParticipant(created.id, CUSTOMER_A);
    expect(repo.getById(created.id)!.participantCustomerIds).toEqual([CUSTOMER_B]);

    const forA = listUpcomingEventsForCustomer(
      repo.getByMemberId(OWNER),
      CUSTOMER_A,
      "2026-09-01T08:00",
    );
    expect(forA).toHaveLength(0);

    const forB = listUpcomingEventsForCustomer(
      repo.getByMemberId(OWNER),
      CUSTOMER_B,
      "2026-09-01T08:00",
    );
    expect(forB).toHaveLength(1);
    expect(forB[0].eventId).toBe(created.id);

    repo.delete(created.id);
    expect(repo.getById(created.id)).toBeUndefined();
  });

  it("create-from-customer seeds the participant relationship", () => {
    const storage = new MemoryStorageAdapter();
    const repo = createCalendarEventRepository(storage);
    const created = repo.create({
      memberId: OWNER,
      title: "量測",
      startAt: "2026-09-18T09:00",
      endAt: "2026-09-18T09:30",
      color: "blue",
      activityTypeKey: "measurement",
      participantCustomerIds: [CUSTOMER_A],
    });
    expect(eventHasParticipant(created, CUSTOMER_A)).toBe(true);
    expect(
      listUpcomingEventsForCustomer(repo.getAll(), CUSTOMER_A, "2026-09-01T00:00")[0].title,
    ).toBe("量測");
  });
});
