/**
 * Node smoke for consultation single-event lifecycle (no browser required).
 * Run: npx tsx scripts/smoke-consultation-lifecycle.ts
 */
import {
  completeCalendarActivityEvent,
  ensureScheduledConsultationCalendarEvent,
  getLinkedCalendarActivityEventId,
} from "../src/lib/calendar/calendar-baki-event-sync";
import { logTodayActivity } from "../src/lib/daily-action/log-today-action";
import { ACTIVITY_EVENT_KEYS } from "../src/lib/event-center/event-types";
import { projectEventsForEngines } from "../src/lib/event-center/project-events";
import { createEventRepository } from "../src/lib/repositories/event-repository";
import { STORAGE_KEYS } from "../src/lib/repositories/storage-keys";
import type { StorageAdapter } from "../src/lib/repositories/storage-adapter";
import type { CalendarEvent } from "../src/types/calendar-event";

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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const memberId = "member-default";
const storage = new MemoryStorage();
storage.setItem(STORAGE_KEYS.bakiEvents, "[]");

const calendarEvent: CalendarEvent = {
  id: "cal-smoke-1",
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  memberId,
  title: "TEST-諮詢-單一事件-smoke",
  startAt: "2026-09-02T10:00",
  endAt: "2026-09-02T11:00",
  allDay: false,
  color: "purple",
  recurrence: { frequency: "none", interval: 1 },
  activityTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
};

const occurrenceDate = "2026-09-02";

// FLOW A
ensureScheduledConsultationCalendarEvent(storage, memberId, calendarEvent, occurrenceDate);
const scheduledId = getLinkedCalendarActivityEventId(
  storage,
  memberId,
  calendarEvent.id,
  occurrenceDate,
);
assert(Boolean(scheduledId), "scheduled consultation event should exist");

completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate, {
  customerName: "TEST-諮詢-smoke",
});
const completedId = getLinkedCalendarActivityEventId(
  storage,
  memberId,
  calendarEvent.id,
  occurrenceDate,
);
assert(scheduledId === completedId, "completion must preserve same event id");

completeCalendarActivityEvent(storage, memberId, calendarEvent, occurrenceDate, {
  customerName: "TEST-諮詢-smoke",
});
assert(
  createEventRepository(storage).getByMemberId(memberId).length === 1,
  "double complete must not duplicate",
);

// FLOW B
logTodayActivity("consultation", { customerName: "TEST-快速諮詢-smoke" }, storage);
const all = createEventRepository(storage).getAll();
assert(all.length === 2, "quick consultation adds one separate completed event");

const projected = projectEventsForEngines(all);
assert(
  projected.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.CONSULTATION).length === 2,
  "both completed consultations count for KPI",
);

console.log("PASS: consultation single-event lifecycle smoke");
