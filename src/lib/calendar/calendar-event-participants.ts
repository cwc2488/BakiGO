import type { CalendarEvent } from "@/types/calendar-event";
import type { CalendarEventParticipant } from "@/types/calendar-event-participant";
import type { Customer } from "@/types/customer";
import type { EntityId } from "@/types";
import { getCalendarCategoryLabel, resolveCalendarCategoryKey } from "./calendar-activity-types";

/** Normalize participant id list — unique, stable order of first occurrence. */
export function uniqueCustomerIds(ids: readonly EntityId[] | undefined): EntityId[] {
  if (!ids?.length) return [];
  const seen = new Set<string>();
  const out: EntityId[] = [];
  for (const id of ids) {
    const trimmed = String(id ?? "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function eventHasParticipant(event: CalendarEvent, customerId: EntityId): boolean {
  return uniqueCustomerIds(event.participantCustomerIds).includes(customerId);
}

export function withParticipantAdded(
  event: CalendarEvent,
  customerId: EntityId,
): CalendarEvent {
  const ids = uniqueCustomerIds([...(event.participantCustomerIds ?? []), customerId]);
  return {
    ...event,
    participantCustomerIds: ids,
    updatedAt: new Date().toISOString(),
  };
}

export function withParticipantRemoved(
  event: CalendarEvent,
  customerId: EntityId,
): CalendarEvent {
  const ids = uniqueCustomerIds(event.participantCustomerIds).filter((id) => id !== customerId);
  return {
    ...event,
    participantCustomerIds: ids.length > 0 ? ids : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function stripCustomerFromAllEvents(
  events: CalendarEvent[],
  customerId: EntityId,
): CalendarEvent[] {
  return events.map((event) =>
    eventHasParticipant(event, customerId) ? withParticipantRemoved(event, customerId) : event,
  );
}

export type UpcomingCustomerEventView = {
  eventId: EntityId;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  activityTypeKey?: string;
  categoryLabel: string;
  dateLabel: string;
  timeLabel: string;
};

function formatDateLabel(startAt: string, allDay: boolean): string {
  const date = startAt.slice(0, 10);
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${Number(m)}/${Number(d)}`;
}

function formatTimeLabel(startAt: string, endAt: string, allDay: boolean): string {
  if (allDay) return "整天";
  const start = startAt.slice(11, 16);
  const end = endAt.slice(11, 16);
  if (!start) return "—";
  return end ? `${start}–${end}` : start;
}

/**
 * Upcoming personal events linked to a customer, chronological.
 * Excludes shared-attendance-only rows from other calendars.
 */
export function listUpcomingEventsForCustomer(
  events: CalendarEvent[],
  customerId: EntityId,
  nowIso: string,
): UpcomingCustomerEventView[] {
  const now = nowIso.slice(0, 16);
  return events
    .filter((event) => !event.attendedFromShared)
    .filter((event) => eventHasParticipant(event, customerId))
    .filter((event) => event.endAt >= now || event.startAt >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((event) => {
      const categoryKey = resolveCalendarCategoryKey(event.activityTypeKey);
      return {
        eventId: event.id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        activityTypeKey: event.activityTypeKey,
        categoryLabel: getCalendarCategoryLabel(categoryKey),
        dateLabel: formatDateLabel(event.startAt, event.allDay),
        timeLabel: formatTimeLabel(event.startAt, event.endAt, event.allDay),
      };
    });
}

export function listLinkableUpcomingEvents(
  events: CalendarEvent[],
  customerId: EntityId,
  nowIso: string,
): UpcomingCustomerEventView[] {
  const now = nowIso.slice(0, 16);
  return events
    .filter((event) => !event.attendedFromShared)
    .filter((event) => event.endAt >= now || event.startAt >= now)
    .filter((event) => !eventHasParticipant(event, customerId))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((event) => {
      const categoryKey = resolveCalendarCategoryKey(event.activityTypeKey);
      return {
        eventId: event.id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        activityTypeKey: event.activityTypeKey,
        categoryLabel: getCalendarCategoryLabel(categoryKey),
        dateLabel: formatDateLabel(event.startAt, event.allDay),
        timeLabel: formatTimeLabel(event.startAt, event.endAt, event.allDay),
      };
    });
}

export function resolveParticipantCustomers(
  participantIds: readonly EntityId[] | undefined,
  customers: Customer[],
): Customer[] {
  const byId = new Map(customers.map((c) => [c.id, c]));
  return uniqueCustomerIds(participantIds)
    .map((id) => byId.get(id))
    .filter((c): c is Customer => Boolean(c));
}

export function assertCustomerOwnedByMember(
  customer: Customer | undefined,
  ownerMemberId: EntityId,
): customer is Customer {
  return Boolean(customer && customer.ownerMemberId === ownerMemberId);
}

export function toParticipantRows(
  event: CalendarEvent,
  ownerMemberId: EntityId,
  now: string,
): CalendarEventParticipant[] {
  return uniqueCustomerIds(event.participantCustomerIds).map((customerId) => ({
    id: `${event.id}:${customerId}`,
    createdAt: now,
    updatedAt: now,
    ownerMemberId,
    eventId: event.id,
    customerId,
  }));
}
