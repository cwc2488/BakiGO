import { CALENDAR_OTHER_ACTIVITY_KEY } from "@/lib/calendar/calendar-activity-types";
import { APP_IDS } from "@/lib/config/app-config";
import {
  ACTIVITY_LIFECYCLE_STATUS,
  buildCompletedActivityMetadata,
  buildScheduledActivityMetadata,
  buildSkippedActivityMetadata,
  getActivityLifecycleStatus,
  isActivityCompletionFinalized,
} from "@/lib/event-center/activity-lifecycle";
import { getEventTypeDefinition, ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { rethrowStorageUserError } from "@/lib/repositories/storage-quota-error";
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
  lifecycleStatus?: string;
  completedAt?: string;
  customerName?: string;
  customerPhone?: string;
  region?: string;
}

interface CalendarAttendanceInput {
  sharedEventId: string;
  activityTypeKey: string;
  newFriendsCount?: number;
  title: string;
  notes?: string;
  startAt: string;
}

export interface CalendarActivityCompletionResult {
  customerName?: string;
  customerPhone?: string;
  region?: string;
  note?: string;
}

export function isRecordableCalendarActivityKey(activityTypeKey: string | undefined): boolean {
  if (!activityTypeKey || activityTypeKey === CALENDAR_OTHER_ACTIVITY_KEY) {
    return false;
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
  try {
    storage.setItem(STORAGE_KEYS.bakiEvents, JSON.stringify(events));
  } catch (error) {
    rethrowStorageUserError(error);
  }
}

function upsertLinkedEvent(
  storage: StorageAdapter,
  input: BakiEventCreateInput,
  link: { sharedEventId?: string; calendarEventId?: string; occurrenceDate?: ISODateString },
  options?: { preserveCompleted?: boolean },
): MemberComputedMetrics {
  const repository = createEventRepository(storage);
  const existing = findLinkedCalendarBakiEvent(storage, input.memberId, link);
  const now = new Date().toISOString();

  if (existing) {
    const existingStatus = getActivityLifecycleStatus(existing.metadata);
    const incomingStatus = getActivityLifecycleStatus(input.metadata);

    if (
      options?.preserveCompleted &&
      existingStatus === ACTIVITY_LIFECYCLE_STATUS.COMPLETED &&
      incomingStatus === ACTIVITY_LIFECYCLE_STATUS.SCHEDULED
    ) {
      return recalculateMemberMetrics(
        { memberId: input.memberId, referenceDate: existing.eventDate },
        storage,
      );
    }

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
  const existing = findLinkedCalendarBakiEvent(storage, memberId, {
    calendarEventId,
    occurrenceDate,
  });
  if (!existing) {
    return false;
  }
  return isActivityCompletionFinalized(existing);
}

function resolveCalendarEventId(calendarEvent: CalendarEvent | ExpandedCalendarEvent): string {
  return "sourceEventId" in calendarEvent ? calendarEvent.sourceEventId : calendarEvent.id;
}

function resolveOccurrenceDate(
  calendarEvent: CalendarEvent | ExpandedCalendarEvent,
  occurrenceDate?: ISODateString,
): ISODateString {
  if (occurrenceDate) {
    return occurrenceDate;
  }
  if ("occurrenceDate" in calendarEvent && calendarEvent.occurrenceDate) {
    return calendarEvent.occurrenceDate.slice(0, 10);
  }
  return calendarEvent.startAt.slice(0, 10);
}

function buildPersonalCalendarActivityInput(
  memberId: EntityId,
  calendarEvent: CalendarEvent | ExpandedCalendarEvent,
  activityTypeKey: string,
  date: ISODateString,
  calendarEventId: string,
  metadataBase: EntityMetadataPartial,
): BakiEventCreateInput {
  return {
    organizationId: APP_IDS.organizationId,
    memberId,
    eventTypeKey: activityTypeKey,
    eventCategory: "activity",
    eventDate: date,
    metadata: {
      source: "calendar",
      calendarEventId,
      occurrenceDate: date,
      calendarTitle: calendarEvent.title,
      ...metadataBase,
    },
  };
}

type EntityMetadataPartial = Record<string, string | number | boolean | undefined>;

/** Create or refresh a scheduled consultation row when a calendar appointment is saved. */
export function ensureScheduledConsultationCalendarEvent(
  storage: StorageAdapter,
  memberId: EntityId,
  calendarEvent: CalendarEvent,
  occurrenceDate?: ISODateString,
): MemberComputedMetrics | null {
  if (calendarEvent.activityTypeKey !== ACTIVITY_EVENT_KEYS.CONSULTATION) {
    return null;
  }

  const activityTypeKey = calendarEvent.activityTypeKey;
  if (!isRecordableCalendarActivityKey(activityTypeKey)) {
    return null;
  }

  const date = resolveOccurrenceDate(calendarEvent, occurrenceDate);
  const calendarEventId = calendarEvent.id;
  const note = buildCalendarNote({
    title: calendarEvent.title,
    notes: calendarEvent.notes,
  });

  const input = buildPersonalCalendarActivityInput(
    memberId,
    calendarEvent,
    activityTypeKey!,
    date,
    calendarEventId,
    {
      note,
      ...buildScheduledActivityMetadata(undefined),
    },
  );

  return upsertLinkedEvent(
    storage,
    input,
    { calendarEventId, occurrenceDate: date },
    { preserveCompleted: true },
  );
}

/** Mark a calendar-linked consultation as completed — updates the same event ID when scheduled. */
export function completeCalendarActivityEvent(
  storage: StorageAdapter,
  memberId: EntityId,
  calendarEvent: CalendarEvent | ExpandedCalendarEvent,
  occurrenceDate: ISODateString,
  result?: CalendarActivityCompletionResult,
): MemberComputedMetrics | null {
  const activityTypeKey =
    "activityTypeKey" in calendarEvent ? calendarEvent.activityTypeKey : undefined;
  if (activityTypeKey !== ACTIVITY_EVENT_KEYS.CONSULTATION) {
    return null;
  }

  const date = resolveOccurrenceDate(calendarEvent, occurrenceDate);
  const calendarEventId = resolveCalendarEventId(calendarEvent);
  const link = { calendarEventId, occurrenceDate: date };
  const existing = findLinkedCalendarBakiEvent(storage, memberId, link);

  if (existing && getActivityLifecycleStatus(existing.metadata) === ACTIVITY_LIFECYCLE_STATUS.COMPLETED) {
    return recalculateMemberMetrics({ memberId, referenceDate: date }, storage);
  }

  const completedAt = new Date().toISOString();
  const resultNote = result?.note?.trim();
  const customerName = result?.customerName?.trim();
  const composedNote = buildCalendarNote({
    title: calendarEvent.title,
    notes: [calendarEvent.notes, resultNote].filter(Boolean).join("\n") || undefined,
  });

  const input = buildPersonalCalendarActivityInput(
    memberId,
    calendarEvent,
    activityTypeKey!,
    date,
    calendarEventId,
    {
      ...(existing?.metadata ?? {}),
      note: composedNote,
      ...(customerName
        ? {
            customerName,
            customerPhone: result?.customerPhone?.trim() || undefined,
            region: result?.region?.trim() || undefined,
          }
        : {}),
      ...buildCompletedActivityMetadata(existing?.metadata, completedAt),
    },
  );

  return upsertLinkedEvent(storage, input, link);
}

export function skipCalendarActivityEvent(
  storage: StorageAdapter,
  memberId: EntityId,
  calendarEvent: CalendarEvent | ExpandedCalendarEvent,
  occurrenceDate: ISODateString,
): MemberComputedMetrics | null {
  const activityTypeKey =
    "activityTypeKey" in calendarEvent ? calendarEvent.activityTypeKey : undefined;
  if (activityTypeKey !== ACTIVITY_EVENT_KEYS.CONSULTATION) {
    return null;
  }

  const date = resolveOccurrenceDate(calendarEvent, occurrenceDate);
  const calendarEventId = resolveCalendarEventId(calendarEvent);
  const link = { calendarEventId, occurrenceDate: date };
  const existing = findLinkedCalendarBakiEvent(storage, memberId, link);

  if (existing && getActivityLifecycleStatus(existing.metadata) === ACTIVITY_LIFECYCLE_STATUS.SKIPPED) {
    return recalculateMemberMetrics({ memberId, referenceDate: date }, storage);
  }

  const input = buildPersonalCalendarActivityInput(
    memberId,
    calendarEvent,
    activityTypeKey!,
    date,
    calendarEventId,
    {
      note: buildCalendarNote({
        title: calendarEvent.title,
        notes: calendarEvent.notes,
      }),
      ...buildSkippedActivityMetadata(undefined),
    },
  );

  return upsertLinkedEvent(storage, input, { calendarEventId, occurrenceDate: date });
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
  result?: CalendarActivityCompletionResult,
): MemberComputedMetrics | null {
  const activityTypeKey =
    "activityTypeKey" in calendarEvent ? calendarEvent.activityTypeKey : undefined;
  if (!isRecordableCalendarActivityKey(activityTypeKey)) {
    return null;
  }

  const date = resolveOccurrenceDate(calendarEvent, occurrenceDate);

  if (activityTypeKey === ACTIVITY_EVENT_KEYS.CONSULTATION) {
    return completeCalendarActivityEvent(storage, memberId, calendarEvent, date, result);
  }

  const calendarEventId = resolveCalendarEventId(calendarEvent);
  const customerName = result?.customerName?.trim();
  const resultNote = result?.note?.trim();
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
      note: buildCalendarNote({
        title: calendarEvent.title,
        notes: [calendarEvent.notes, resultNote].filter(Boolean).join("\n") || undefined,
      }),
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

export function getLinkedCalendarActivityEventId(
  storage: StorageAdapter,
  memberId: EntityId,
  calendarEventId: string,
  occurrenceDate: ISODateString,
): string | undefined {
  return findLinkedCalendarBakiEvent(storage, memberId, { calendarEventId, occurrenceDate })?.id;
}
