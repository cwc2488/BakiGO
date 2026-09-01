import { describe, expect, it } from "vitest";
import {
  addAllianceEventParticipant,
  hasAllianceParticipant,
  listAllianceEventIdsForCustomer,
  listAllianceParticipantsForEvent,
  removeAllianceEventParticipant,
} from "./alliance-event-participants";
import {
  filterNextActivityItems,
  groupNextActivityItems,
  listLinkableNextActivityItems,
  listLinkedNextActivityItems,
  dateGroupHeading,
  type NextActivityPickerItem,
} from "./next-activity-picker";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { defaultRecurrence } from "./recurrence";
import type { CalendarEvent } from "@/types/calendar-event";
import { CALENDAR_EVENT_SOURCE, participantIdentityKey } from "@/types/calendar-event-participant";
import { getTodayDateString, addDays } from "./time-grid";

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
const CUSTOMER_A = "cust-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SHARED_ID = "shared:j9uvfluaq5f8p7j087uiudmdhg@group.calendar.google.com:uid-sports";

function sharedEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const today = getTodayDateString();
  const day = addDays(today, 3);
  return {
    id: SHARED_ID,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    memberId: OWNER,
    title: "中區運動會",
    startAt: `${day}T13:00`,
    endAt: `${day}T18:00`,
    allDay: false,
    color: "green",
    recurrence: defaultRecurrence(),
    activityTypeKey: "meeting",
    googleCalendarId: "j9uvfluaq5f8p7j087uiudmdhg@group.calendar.google.com",
    googleEventId: "uid-sports",
    ...overrides,
  };
}

describe("next-activity picker + alliance shared linking", () => {
  it("does not copy shared events into personal calendar when linking", () => {
    const storage = new MemoryStorageAdapter();
    const repo = createCalendarEventRepository(storage);
    const personal = repo.create({
      memberId: OWNER,
      title: "徐國展",
      startAt: `${addDays(getTodayDateString(), 2)}T10:00`,
      endAt: `${addDays(getTodayDateString(), 2)}T11:00`,
      color: "purple",
      activityTypeKey: "consultation",
    });
    storage.setItem(STORAGE_KEYS.sharedCalendarEvents, JSON.stringify([sharedEvent()]));

    addAllianceEventParticipant(storage, {
      ownerMemberId: OWNER,
      eventId: SHARED_ID,
      customerId: CUSTOMER_A,
    });

    expect(repo.getById(SHARED_ID)).toBeUndefined();
    expect(repo.getAll().every((event) => event.id !== SHARED_ID)).toBe(true);
    expect(hasAllianceParticipant(storage, OWNER, SHARED_ID, CUSTOMER_A)).toBe(true);
    expect(listAllianceEventIdsForCustomer(storage, OWNER, CUSTOMER_A)).toEqual([SHARED_ID]);

    const linked = listLinkedNextActivityItems({
      personalEvents: repo.getAll(),
      sharedEvents: [sharedEvent()],
      storage,
      ownerMemberId: OWNER,
      customerId: CUSTOMER_A,
      nowIso: `${getTodayDateString()}T00:00`,
    });
    expect(linked.map((row) => row.eventSource)).toEqual(["alliance_shared"]);
    expect(linked[0].eventId).toBe(SHARED_ID);

    const linkable = listLinkableNextActivityItems({
      personalEvents: repo.getAll(),
      sharedEvents: [sharedEvent()],
      storage,
      ownerMemberId: OWNER,
      customerId: CUSTOMER_A,
      nowIso: `${getTodayDateString()}T00:00`,
    });
    expect(linkable.some((row) => row.eventId === SHARED_ID)).toBe(false);
    expect(linkable.some((row) => row.eventId === personal.id)).toBe(true);
  });

  it("prevents duplicate alliance links", () => {
    const storage = new MemoryStorageAdapter();
    addAllianceEventParticipant(storage, {
      ownerMemberId: OWNER,
      eventId: SHARED_ID,
      customerId: CUSTOMER_A,
    });
    addAllianceEventParticipant(storage, {
      ownerMemberId: OWNER,
      eventId: SHARED_ID,
      customerId: CUSTOMER_A,
    });
    expect(listAllianceParticipantsForEvent(storage, OWNER, SHARED_ID)).toEqual([CUSTOMER_A]);
  });

  it("unlinking shared does not delete the shared event or customer", () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.sharedCalendarEvents, JSON.stringify([sharedEvent()]));
    addAllianceEventParticipant(storage, {
      ownerMemberId: OWNER,
      eventId: SHARED_ID,
      customerId: CUSTOMER_A,
    });
    removeAllianceEventParticipant(storage, {
      ownerMemberId: OWNER,
      eventId: SHARED_ID,
      customerId: CUSTOMER_A,
    });
    expect(hasAllianceParticipant(storage, OWNER, SHARED_ID, CUSTOMER_A)).toBe(false);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.sharedCalendarEvents) ?? "[]")).toHaveLength(1);
  });

  it("uses collision-safe identity event_source + event_id", () => {
    expect(participantIdentityKey("personal", "abc")).toBe("personal:abc");
    expect(participantIdentityKey("alliance_shared", SHARED_ID)).toBe(
      `alliance_shared:${SHARED_ID}`,
    );
    expect(CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED).toBe("alliance_shared");
  });

  it("privacy: another owner's links are not returned", () => {
    const storage = new MemoryStorageAdapter();
    addAllianceEventParticipant(storage, {
      ownerMemberId: "other-owner",
      eventId: SHARED_ID,
      customerId: "other-customer",
    });
    expect(listAllianceParticipantsForEvent(storage, OWNER, SHARED_ID)).toEqual([]);
    expect(listAllianceEventIdsForCustomer(storage, OWNER, "other-customer")).toEqual([]);
  });

  it("groups dates and filters by source/search", () => {
    const today = getTodayDateString();
    const items: NextActivityPickerItem[] = [
      {
        eventId: "p1",
        eventSource: "personal",
        title: "徐國展",
        startAt: `${today}T10:00`,
        endAt: `${today}T11:00`,
        allDay: false,
        categoryLabel: "諮詢",
        dateLabel: "9/1",
        timeLabel: "10:00–11:00",
        dateKey: today,
        sourceLabel: "我的",
      },
      {
        eventId: SHARED_ID,
        eventSource: "alliance_shared",
        title: "中區運動會",
        startAt: `${addDays(today, 1)}T13:00`,
        endAt: `${addDays(today, 1)}T18:00`,
        allDay: false,
        categoryLabel: "會議",
        dateLabel: "9/2",
        timeLabel: "13:00–18:00",
        dateKey: addDays(today, 1),
        sourceLabel: "聯盟共用",
      },
    ];
    expect(dateGroupHeading(today, today)).toBe("今天");
    expect(dateGroupHeading(addDays(today, 1), today)).toBe("明天");
    const groups = groupNextActivityItems(items);
    expect(groups[0].heading).toBe("今天");
    expect(groups[1].heading).toBe("明天");

    expect(filterNextActivityItems(items, { query: "運動", source: "all" }).map((i) => i.title)).toEqual([
      "中區運動會",
    ]);
    expect(
      filterNextActivityItems(items, { query: "", source: "personal" }).map((i) => i.eventSource),
    ).toEqual(["personal"]);
    expect(filterNextActivityItems(items, { query: "zzz", source: "all" })).toHaveLength(0);
  });
});
