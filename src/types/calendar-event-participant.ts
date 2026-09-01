import type { EntityId, StoredEntity } from "./common";

/** Personal calendar vs Alliance Shared (Google iCal) — collision-safe with eventId. */
export type CalendarEventSource = "personal" | "alliance_shared";

export const CALENDAR_EVENT_SOURCE = {
  PERSONAL: "personal",
  ALLIANCE_SHARED: "alliance_shared",
} as const satisfies Record<string, CalendarEventSource>;

export const CALENDAR_EVENT_SOURCE_LABEL: Record<CalendarEventSource, string> = {
  personal: "我的",
  alliance_shared: "聯盟共用",
};

/**
 * Canonical coach-owned link between a calendar event and a Customer.
 * eventId + eventSource together identify the event (shared IDs use shared:cal:uid).
 */
export interface CalendarEventParticipant extends StoredEntity {
  ownerMemberId: EntityId;
  eventSource: CalendarEventSource;
  eventId: EntityId;
  customerId: EntityId;
}

export interface CalendarEventParticipantCreateInput {
  ownerMemberId: EntityId;
  eventSource: CalendarEventSource;
  eventId: EntityId;
  customerId: EntityId;
}

export function isCalendarEventSource(value: string | undefined): value is CalendarEventSource {
  return value === "personal" || value === "alliance_shared";
}

export function participantIdentityKey(
  source: CalendarEventSource,
  eventId: EntityId,
): string {
  return `${source}:${eventId}`;
}
