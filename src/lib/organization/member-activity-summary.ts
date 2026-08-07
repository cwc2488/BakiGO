import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { MEETING_KEY_LIST } from "@/lib/event-center/meeting-types";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import { loadMemberSharedCalendarAttendance } from "@/lib/calendar/calendar-attendance-storage";
import { createEventRepository } from "@/lib/repositories/event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { EntityId } from "@/types";

export interface MemberActivitySummary {
  monthlyConsultations: number;
  monthlyMeasurements: number;
  monthlyMeetings: number;
  monthlyNewCustomers: number;
  recentMeetings: Array<{ title: string; date: string; newFriendsCount: number }>;
}

const MEETING_KEY_SET = new Set<string>(MEETING_KEY_LIST);

function isInMonth(eventDate: string, yearMonth: string): boolean {
  return eventDate.startsWith(yearMonth);
}

export function buildMemberActivitySummary(
  memberId: EntityId,
  referenceDate: string,
  storage: StorageAdapter,
  supplementalEvents?: BakiEvent[],
): MemberActivitySummary {
  const yearMonth = referenceDate.slice(0, 7);
  const localEvents = createEventRepository(storage).getByMemberId(memberId);
  const mergedById = new Map<string, BakiEvent>();
  for (const event of localEvents) {
    mergedById.set(event.id, event);
  }
  for (const event of supplementalEvents ?? []) {
    if (event.memberId === memberId) {
      mergedById.set(event.id, event);
    }
  }
  const events = [...mergedById.values()];

  const monthlyConsultations = events.filter(
    (event) =>
      event.eventTypeKey === ACTIVITY_EVENT_KEYS.CONSULTATION &&
      isInMonth(event.eventDate, yearMonth),
  ).length;

  const monthlyMeasurements = events.filter(
    (event) =>
      event.eventTypeKey === ACTIVITY_EVENT_KEYS.MEASUREMENT &&
      isInMonth(event.eventDate, yearMonth),
  ).length;

  const monthlyMeetingsFromEvents = events.filter(
    (event) => MEETING_KEY_SET.has(event.eventTypeKey) && isInMonth(event.eventDate, yearMonth),
  ).length;

  const calendarMeetingsThisMonth = loadMemberSharedCalendarAttendance(storage, memberId).filter(
    (item) => isInMonth(item.startAt.slice(0, 10), yearMonth),
  ).length;

  const monthlyMeetings = monthlyMeetingsFromEvents + calendarMeetingsThisMonth;

  const monthlyNewCustomers = events.filter(
    (event) =>
      event.eventTypeKey === RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD &&
      isInMonth(event.eventDate, yearMonth),
  ).length;

  const recentMeetings = loadMemberSharedCalendarAttendance(storage, memberId)
    .sort((left, right) => right.startAt.localeCompare(left.startAt))
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      date: item.startAt.slice(0, 10),
      newFriendsCount: item.newFriendsCount ?? 0,
    }));

  return {
    monthlyConsultations,
    monthlyMeasurements,
    monthlyMeetings,
    monthlyNewCustomers,
    recentMeetings,
  };
}
