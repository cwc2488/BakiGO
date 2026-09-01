import { CALENDAR_CATEGORY_KEYS, CALENDAR_OTHER_ACTIVITY_KEY } from "@/lib/calendar/calendar-activity-types";
import { APP_IDS } from "@/lib/config/app-config";
import { getEventTypeDefinition } from "@/lib/event-center/event-types";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { recalculateMemberMetrics } from "@/lib/services/recalculate-member-metrics";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { BakiEvent, BakiEventCreateInput } from "@/types/baki-event";
import type { CalendarEvent, ExpandedCalendarEvent } from "@/types/calendar-event";
import type { EntityId, ISODateString } from "@/types";

export type CalendarEventSource = "calendar";

export interface CalendarBakiEventMetadata {
  source: CalendarEventSource;
  sharedEventId?: string;
  calendarEventId?: string;
  occurrenceDate?: ISODateString;
  calendarTitle?: string;
  newFriendsCount?: number;
  note?: string;
}

interface CalendarAttendanceInput {
  sharedEventId: string;
  activityTypeKey: string;
  newFriendsCount?: number;
  title: string;
  notes?: string;
  startAt: string;
}

export function isRecordableCalendarActivityKey(activityTypeKey: string | undefined): boolean {
  if (!activityTypeKey || activityTypeKey === CALENDAR_OTHER_ACTIVITY_KEY) {
    return false;
  }
  if (activityTypeKey === CALENDAR_CATEGORY_KEYS.MEETING) {
    return true;
  }
  const definition = getEventTypeDefinition(activityTypeKey);
  return definition?.category === "activity";
}

function buildCalendarNote(input: {
  title?: string;
  notes?: string;
  newFriendsCount?: number;
}): string | undefined {
  const parts: string[] = [];
  if (input.title?.trim()) {
    parts.push(input.title.trim());
  }
  if (input.notes?.trim()) {
    parts.push(input.notes.trim());
  }
  if (input.newFriendsCount && input.newFriendsCount > 0) {
    parts.push(`帶 ${input.newFriendsCount} 位新朋友`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function findLinkedCalendarBakiEvent(
  storage: StorageAdapter,
  memberId: EntityId,
  link: { sharedEventId?: string; calendarEventId?: string; occurrenceDate?: ISODateString },
): BakiEvent | undefined {
  return createEventRepository(storage)
    .getByMemberId(memberId)
    .find((event) => {
      const metadata = event.metadata as CalendarBakiEventMetadata | undefined;
      if (metadata?.source !== "calendar") {
        return false;
      }
      if (link.sharedEventId && metadata.sharedEventId === link.sharedEventId) {
        return true;
      }
      return (
        Boolean(link.calendarEventId) &&
        metadata.calendarEventId === link.calendarEventId &&
        metadata.occurrenceDate === link.occurrenceDate
      );
    });
}

function persistEvents(storage: StorageAdapter, events: BakiEvent[]): void {
  storage.setItem(STORAGE_KEYS.bakiEvents, JSON.stringify(events));
}

function upsertLinkedEvent(
  storage: StorageAdapter,
  input: BakiEventCreateInput,
  link: { sharedEventId?: string; calendarEventId?: string; occurrenceDate?: ISODateString },
): MemberComputedMetrics {
  const repository = createEventRepository(storage);
  const existing = findLinkedCalendarBakiEvent(storage, input.memberId, link);
  const now = new Date().toISOString();

  if (existing) {
    const updated: BakiEvent = {
      ...existing,
      eventTypeKey: input.eventTypeKey,
      eventDate: input.eventDate,
      metadata: {
        ...existing.metadata,
        ...input.metadata,
      },
      updatedAt: now,
    };
    persistEvents(
      storage,
      repository.getAll().map((event) => (event.id === existing.id ? updated : event)),
    );
  } else {
    repository.create(input);
  }

  return recalculateMemberMetrics(
    { memberId: input.memberId, referenceDate: input.eventDate },
    storage,
  );
}

export function removeLinkedCalendarBakiEvent(
  storage: StorageAdapter,
  memberId: EntityId,
  link: { sharedEventId?: string; calendarEventId?: string; occurrenceDate?: ISODateString },
  referenceDate: ISODateString,
): MemberComputedMetrics | null {
  const repository = createEventRepository(storage);
  const existing = findLinkedCalendarBakiEvent(storage, memberId, link);
  if (!existing) {
    return null;
  }

  persistEvents(
    storage,
    repository.getAll().filter((event) => event.id !== existing.id),
  );

  return recalculateMemberMetrics({ memberId, referenceDate }, storage);
}

export function isPersonalCalendarEventLogged(
  storage: StorageAdapter,
  memberId: EntityId,
  calendarEventId: string,
  occurrenceDate: ISODateString,
): boolean {
  return Boolean(
    findLinkedCalendarBakiEvent(storage, memberId, { calendarEventId, occurrenceDate }),
  );
}

export function syncSharedAttendanceToBakiEvent(
  storage: StorageAdapter,
  memberId: EntityId,
  attendance: CalendarAttendanceInput,
): MemberComputedMetrics | null {
  if (!isRecordableCalendarActivityKey(attendance.activityTypeKey)) {
    return null;
  }

  const eventDate = attendance.startAt.slice(0, 10);
  const input: BakiEventCreateInput = {
    organizationId: APP_IDS.organizationId,
    memberId,
    eventTypeKey: attendance.activityTypeKey,
    eventCategory: "activity",
    eventDate,
    metadata: {
      source: "calendar",
      sharedEventId: attendance.sharedEventId,
      occurrenceDate: eventDate,
      calendarTitle: attendance.title,
      newFriendsCount: attendance.newFriendsCount ?? 0,
      note: buildCalendarNote({
        title: attendance.title,
        notes: attendance.notes,
        newFriendsCount: attendance.newFriendsCount,
      }),
    },
  };

  return upsertLinkedEvent(storage, input, { sharedEventId: attendance.sharedEventId });
}

export function syncPersonalCalendarEventToBakiEvent(
  storage: StorageAdapter,
  memberId: EntityId,
  calendarEvent: CalendarEvent | ExpandedCalendarEvent,
  occurrenceDate?: ISODateString,
  result?: {
    customerName?: string;
    customerPhone?: string;
    region?: string;
    note?: string;
  },
): MemberComputedMetrics | null {
  const activityTypeKey =
    "activityTypeKey" in calendarEvent ? calendarEvent.activityTypeKey : undefined;
  if (!isRecordableCalendarActivityKey(activityTypeKey)) {
    return null;
  }

  const date = occurrenceDate ?? calendarEvent.startAt.slice(0, 10);
  const calendarEventId =
    "sourceEventId" in calendarEvent ? calendarEvent.sourceEventId : calendarEvent.id;

  const customerName = result?.customerName?.trim();
  const resultNote = result?.note?.trim();
  const composedNote = buildCalendarNote({
    title: calendarEvent.title,
    notes: [calendarEvent.notes, resultNote].filter(Boolean).join("\n") || undefined,
  });

  const input: BakiEventCreateInput = {
    organizationId: APP_IDS.organizationId,
    memberId,
    eventTypeKey: activityTypeKey!,
    eventCategory: "activity",
    eventDate: date,
    metadata: {
      source: "calendar",
      calendarEventId,
      occurrenceDate: date,
      calendarTitle: calendarEvent.title,
      note: composedNote,
      ...(customerName
        ? {
            customerName,
            customerPhone: result?.customerPhone?.trim() || undefined,
            region: result?.region?.trim() || undefined,
          }
        : {}),
    },
  };

  return upsertLinkedEvent(storage, input, { calendarEventId, occurrenceDate: date });
}

export function removeBakiEventForSharedAttendance(
  storage: StorageAdapter,
  memberId: EntityId,
  sharedEventId: string,
  referenceDate: ISODateString,
): MemberComputedMetrics | null {
  return removeLinkedCalendarBakiEvent(
    storage,
    memberId,
    { sharedEventId },
    referenceDate,
  );
}

export function removeBakiEventForPersonalCalendarEvent(
  storage: StorageAdapter,
  memberId: EntityId,
  calendarEventId: string,
  occurrenceDate: ISODateString,
): MemberComputedMetrics | null {
  return removeLinkedCalendarBakiEvent(
    storage,
    memberId,
    { calendarEventId, occurrenceDate },
    occurrenceDate,
  );
}
