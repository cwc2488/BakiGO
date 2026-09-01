import type { EntityId, StoredEntity } from "./common";

/**
 * Canonical coach-owned link between a personal CalendarEvent and a Customer.
 * eventId references CalendarEvent.id (JSON store); customerId is stable UUID.
 */
export interface CalendarEventParticipant extends StoredEntity {
  ownerMemberId: EntityId;
  eventId: EntityId;
  customerId: EntityId;
}

export interface CalendarEventParticipantCreateInput {
  ownerMemberId: EntityId;
  eventId: EntityId;
  customerId: EntityId;
}
