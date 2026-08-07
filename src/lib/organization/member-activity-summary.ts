import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { loadMemberSharedCalendarAttendance } from "@/lib/calendar/calendar-attendance-storage";
import { createEventRepository } from "@/lib/repositories/event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { EntityId } from "@/types";

export interface MemberActivitySummary {
  monthlyConsultations: number;
  monthlyMeasurements: number;
  recentMeetings: Array<{ title: string; date: string; newFriendsCount: number }>;
}

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
    recentMeetings,
  };
}
