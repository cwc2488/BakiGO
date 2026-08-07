import { addDays } from "@/lib/calendar/recurrence";
import type {
  CalendarEvent,
  CalendarEventCreateInput,
  CalendarEventUpdateInput,
  RecurrenceEditScope,
  RecurrenceException,
} from "@/types/calendar-event";

export function isRecurringSeries(event: CalendarEvent): boolean {
  return event.recurrence.frequency !== "none";
}

function upsertException(
  exceptions: RecurrenceException[] | undefined,
  next: RecurrenceException,
): RecurrenceException[] {
  const filtered = (exceptions ?? []).filter(
    (item) => item.occurrenceDate !== next.occurrenceDate,
  );
  return [...filtered, next];
}

function truncateSeriesBefore(
  recurrence: CalendarEvent["recurrence"],
  occurrenceDate: string,
): CalendarEvent["recurrence"] {
  const dayBefore = addDays(occurrenceDate, -1);
  return {
    ...recurrence,
    neverEnds: false,
    endDate: dayBefore,
    count: undefined,
  };
}

export function buildOccurrenceOverride(
  values: CalendarEventUpdateInput,
): RecurrenceException["override"] {
  return {
    title: values.title,
    notes: values.notes,
    startAt: values.startAt,
    endAt: values.endAt,
    allDay: values.allDay,
    color: values.color,
    activityTypeKey: values.activityTypeKey,
    reminderMinutes: values.reminderMinutes,
  };
}

export type RecurrenceMutationResult =
  | { action: "update"; eventId: string; input: CalendarEventUpdateInput }
  | { action: "delete"; eventId: string }
  | { action: "create"; input: CalendarEventCreateInput; updateParent?: { eventId: string; input: CalendarEventUpdateInput } };

export function planRecurringDelete(
  event: CalendarEvent,
  occurrenceDate: string,
  scope: RecurrenceEditScope,
): RecurrenceMutationResult {
  if (scope === "this") {
    return {
      action: "update",
      eventId: event.id,
      input: {
        recurrenceExceptions: upsertException(event.recurrenceExceptions, {
          occurrenceDate,
          deleted: true,
        }),
      },
    };
  }

  if (occurrenceDate <= event.startAt.slice(0, 10)) {
    return { action: "delete", eventId: event.id };
  }

  return {
    action: "update",
    eventId: event.id,
    input: {
      recurrence: truncateSeriesBefore(event.recurrence, occurrenceDate),
    },
  };
}

export function planRecurringUpdate(
  event: CalendarEvent,
  occurrenceDate: string,
  scope: RecurrenceEditScope,
  payload: CalendarEventUpdateInput,
): RecurrenceMutationResult {
  if (scope === "this") {
    return {
      action: "update",
      eventId: event.id,
      input: {
        recurrenceExceptions: upsertException(event.recurrenceExceptions, {
          occurrenceDate,
          override: buildOccurrenceOverride(payload),
        }),
      },
    };
  }

  if (occurrenceDate <= event.startAt.slice(0, 10)) {
    return {
      action: "update",
      eventId: event.id,
      input: payload,
    };
  }

  return {
    action: "create",
    input: {
      memberId: event.memberId,
      title: payload.title ?? event.title,
      notes: payload.notes ?? event.notes,
      startAt: payload.startAt ?? event.startAt,
      endAt: payload.endAt ?? event.endAt,
      allDay: payload.allDay ?? event.allDay,
      color: payload.color ?? event.color,
      activityTypeKey: payload.activityTypeKey ?? event.activityTypeKey,
      reminderMinutes: payload.reminderMinutes ?? event.reminderMinutes,
      recurrence: payload.recurrence ?? event.recurrence,
      attendedFromShared: event.attendedFromShared,
      googleCalendarId: event.googleCalendarId,
    },
    updateParent: {
      eventId: event.id,
      input: {
        recurrence: truncateSeriesBefore(event.recurrence, occurrenceDate),
      },
    },
  };
}

export function getOccurrenceDateFromExpanded(
  expanded: { startAt: string; isRecurringInstance: boolean },
  source: CalendarEvent,
): string | null {
  if (!isRecurringSeries(source)) {
    return null;
  }
  return expanded.startAt.slice(0, 10);
}
