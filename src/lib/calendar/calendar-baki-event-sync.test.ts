import { describe, expect, it, beforeEach } from "vitest";
import {
  completeCalendarActivityEvent,
  ensureScheduledConsultationCalendarEvent,
  findLinkedCalendarBakiEvent,
  getLinkedCalendarActivityEventId,
  isPersonalCalendarEventLogged,
  skipCalendarActivityEvent,
  syncPersonalCalendarEventToBakiEvent,
} from "@/lib/calendar/calendar-baki-event-sync";
import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { ACTIVITY_LIFECYCLE_STATUS } from "@/lib/event-center/activity-lifecycle";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CalendarEvent } from "@/types/calendar-event";

class MemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();

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

const memberId = "member-test";
const occurrenceDate = "2026-09-15";

function buildCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "cal-consult-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    memberId,
    title: "王小姐諮詢",
    notes: "初次諮詢",
    startAt: `${occurrenceDate}T10:00`,
    endAt: `${occurrenceDate}T11:00`,
    allDay: false,
    color: "purple",
    recurrence: { frequency: "none", interval: 1 },
    activityTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
    ...overrides,
  };
}

describe("calendar consultation single event lifecycle", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.bakiEvents, "[]");
  });

  it("creates exactly one scheduled consultation when calendar appointment is saved", () => {
    const calendarEvent = buildCalendarEvent();
    ensureScheduledConsultationCalendarEvent(storage, memberId, calendarEvent, occurrenceDate);

    const events = createEventRepository(storage).getByMemberId(memberId);
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata?.lifecycleStatus).toBe(ACTIVITY_LIFECYCLE_STATUS.SCHEDULED);
    expect(events[0]?.metadata?.calendarEventId).toBe(calendarEvent.id);
  });

  it("completes scheduled consultation on the same event id", () => {
    const calendarEvent = buildCalendarEvent();
    ensureScheduledConsultationCalendarEvent(storage, memberId, calendarEvent, occurrenceDate);
    const scheduledId = getLinkedCalendarActivityEventId(
      storage,
      memberId,
      calendarEvent.id,
      occurrenceDate,
    );

    completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate);

    const events = createEventRepository(storage).getByMemberId(memberId);
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(scheduledId);
    expect(events[0]?.metadata?.lifecycleStatus).toBe(ACTIVITY_LIFECYCLE_STATUS.COMPLETED);
    expect(events[0]?.metadata?.customerName).toBeUndefined();
    expect(isPersonalCalendarEventLogged(storage, memberId, calendarEvent.id, occurrenceDate)).toBe(
      true,
    );
  });

  it("is idempotent when completing the same consultation twice", () => {
    const calendarEvent = buildCalendarEvent();
    ensureScheduledConsultationCalendarEvent(storage, memberId, calendarEvent, occurrenceDate);

    completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate, {
      customerName: "王小姐",
      note: "第一次完成",
    });
    const firstId = getLinkedCalendarActivityEventId(
      storage,
      memberId,
      calendarEvent.id,
      occurrenceDate,
    );
    const firstNote = createEventRepository(storage).getByMemberId(memberId)[0]?.metadata?.note;

    completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate, {
      customerName: "王小姐",
      note: "第二次點擊",
    });

    const events = createEventRepository(storage).getByMemberId(memberId);
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(firstId);
    expect(events[0]?.metadata?.note).toBe(firstNote);
  });

  it("does not duplicate when completing without a prior scheduled row", () => {
    const calendarEvent = buildCalendarEvent();

    completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate, {
      customerName: "李先生",
    });
    const firstId = findLinkedCalendarBakiEvent(storage, memberId, {
      calendarEventId: calendarEvent.id,
      occurrenceDate,
    })?.id;

    completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate, {
      customerName: "李先生",
    });

    const events = createEventRepository(storage).getByMemberId(memberId);
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(firstId);
    expect(events[0]?.metadata?.lifecycleStatus).toBe(ACTIVITY_LIFECYCLE_STATUS.COMPLETED);
  });

  it("isolates recurring consultation occurrences by occurrenceDate", () => {
    const calendarEvent = buildCalendarEvent({
      recurrence: { frequency: "weekly", interval: 1, neverEnds: true },
    });
    const secondOccurrence = "2026-09-22";

    completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate, {
      customerName: "第一場",
    });
    completeCalendarActivityEvent(storage, memberId, calendarEvent, secondOccurrence, {
      customerName: "第二場",
    });

    const events = createEventRepository(storage)
      .getByMemberId(memberId)
      .filter((event) => event.metadata?.calendarEventId === calendarEvent.id);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.metadata?.occurrenceDate).sort()).toEqual([
      occurrenceDate,
      secondOccurrence,
    ]);
  });

  it("does not create scheduled rows for measurement calendar appointments", () => {
    const calendarEvent = buildCalendarEvent({
      activityTypeKey: ACTIVITY_EVENT_KEYS.MEASUREMENT,
      title: "量測預約",
    });
    ensureScheduledConsultationCalendarEvent(storage, memberId, calendarEvent, occurrenceDate);
    expect(createEventRepository(storage).getByMemberId(memberId)).toHaveLength(0);
  });

  it("records measurement on calendar complete without a prior scheduled row", () => {
    const calendarEvent = buildCalendarEvent({
      activityTypeKey: ACTIVITY_EVENT_KEYS.MEASUREMENT,
      title: "量測預約",
    });
    syncPersonalCalendarEventToBakiEvent(storage, memberId, calendarEvent, occurrenceDate);
    const events = createEventRepository(storage).getByMemberId(memberId);
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata?.lifecycleStatus).toBeUndefined();
  });

  it("does not count scheduled or skipped consultations toward KPI projection", () => {
    const calendarEvent = buildCalendarEvent();
    ensureScheduledConsultationCalendarEvent(storage, memberId, calendarEvent, occurrenceDate);

    const scheduledOnly = projectEventsForEngines(createEventRepository(storage).getAll());
    expect(
      scheduledOnly.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.CONSULTATION),
    ).toHaveLength(0);

    skipCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate);
    const skippedOnly = projectEventsForEngines(createEventRepository(storage).getAll());
    expect(
      skippedOnly.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.CONSULTATION),
    ).toHaveLength(0);
  });

  it("counts exactly one KPI after one-tap calendar completion", () => {
    const calendarEvent = buildCalendarEvent();
    ensureScheduledConsultationCalendarEvent(storage, memberId, calendarEvent, occurrenceDate);
    completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate);

    const once = projectEventsForEngines(createEventRepository(storage).getAll());
    expect(
      once.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.CONSULTATION),
    ).toHaveLength(1);

    completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate);
    const twice = projectEventsForEngines(createEventRepository(storage).getAll());
    expect(
      twice.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.CONSULTATION),
    ).toHaveLength(1);
    expect(createEventRepository(storage).getByMemberId(memberId)).toHaveLength(1);
  });

  it("preserves existing customer linkage metadata on one-tap completion", () => {
    const calendarEvent = buildCalendarEvent();
    ensureScheduledConsultationCalendarEvent(storage, memberId, calendarEvent, occurrenceDate);
    const repository = createEventRepository(storage);
    const scheduled = repository.getByMemberId(memberId)[0]!;
    repository.update(scheduled.id, {
      metadata: {
        ...scheduled.metadata,
        customerId: "customer-123",
        customerName: "既有客戶",
      },
    });

    completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate);
    const completed = repository.getByMemberId(memberId)[0];
    expect(completed?.id).toBe(scheduled.id);
    expect(completed?.metadata?.customerId).toBe("customer-123");
    expect(completed?.metadata?.customerName).toBe("既有客戶");
  });
});
