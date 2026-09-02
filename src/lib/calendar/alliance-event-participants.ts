import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { flushPendingCloudSync } from "@/lib/repositories/syncing-storage-adapter";
import { flushCalendarEventParticipantsCloud } from "@/lib/cloud/calendar-event-participants-cloud";
import type { EntityId } from "@/types";
import {
  CALENDAR_EVENT_SOURCE,
  type CalendarEventParticipant,
  type CalendarEventSource,
} from "@/types/calendar-event-participant";

function parseLinks(raw: string | null): CalendarEventParticipant[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CalendarEventParticipant[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(storage: StorageAdapter, links: CalendarEventParticipant[]): void {
  storage.setItem(STORAGE_KEYS.calendarAllianceEventParticipants, JSON.stringify(links));
  flushPendingCloudSync();
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `part-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadAllianceEventParticipants(
  storage: StorageAdapter,
): CalendarEventParticipant[] {
  return parseLinks(storage.getItem(STORAGE_KEYS.calendarAllianceEventParticipants)).filter(
    (row) => row.eventSource === CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED,
  );
}

export function listAllianceParticipantsForEvent(
  storage: StorageAdapter,
  ownerMemberId: EntityId,
  eventId: EntityId,
): EntityId[] {
  const seen = new Set<string>();
  const ids: EntityId[] = [];
  for (const row of loadAllianceEventParticipants(storage)) {
    if (row.ownerMemberId !== ownerMemberId || row.eventId !== eventId) continue;
    if (seen.has(row.customerId)) continue;
    seen.add(row.customerId);
    ids.push(row.customerId);
  }
  return ids;
}

export function listAllianceEventIdsForCustomer(
  storage: StorageAdapter,
  ownerMemberId: EntityId,
  customerId: EntityId,
): EntityId[] {
  const seen = new Set<string>();
  const ids: EntityId[] = [];
  for (const row of loadAllianceEventParticipants(storage)) {
    if (row.ownerMemberId !== ownerMemberId || row.customerId !== customerId) continue;
    if (seen.has(row.eventId)) continue;
    seen.add(row.eventId);
    ids.push(row.eventId);
  }
  return ids;
}

export function hasAllianceParticipant(
  storage: StorageAdapter,
  ownerMemberId: EntityId,
  eventId: EntityId,
  customerId: EntityId,
): boolean {
  return loadAllianceEventParticipants(storage).some(
    (row) =>
      row.ownerMemberId === ownerMemberId &&
      row.eventId === eventId &&
      row.customerId === customerId,
  );
}

export function addAllianceEventParticipant(
  storage: StorageAdapter,
  input: {
    ownerMemberId: EntityId;
    eventId: EntityId;
    customerId: EntityId;
  },
): void {
  const existing = loadAllianceEventParticipants(storage);
  if (
    existing.some(
      (row) =>
        row.ownerMemberId === input.ownerMemberId &&
        row.eventId === input.eventId &&
        row.customerId === input.customerId,
    )
  ) {
    return;
  }
  const now = nowIso();
  persist(storage, [
    ...existing,
    {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      ownerMemberId: input.ownerMemberId,
      eventSource: CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED,
      eventId: input.eventId,
      customerId: input.customerId,
    },
  ]);
  void flushCalendarEventParticipantsCloud(input.ownerMemberId, input.eventId, {
    eventSource: CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED,
    participantCustomerIds: listAllianceParticipantsForEvent(
      storage,
      input.ownerMemberId,
      input.eventId,
    ),
  });
}

export function removeAllianceEventParticipant(
  storage: StorageAdapter,
  input: {
    ownerMemberId: EntityId;
    eventId: EntityId;
    customerId: EntityId;
  },
): void {
  const next = loadAllianceEventParticipants(storage).filter(
    (row) =>
      !(
        row.ownerMemberId === input.ownerMemberId &&
        row.eventId === input.eventId &&
        row.customerId === input.customerId
      ),
  );
  persist(storage, next);
  void flushCalendarEventParticipantsCloud(input.ownerMemberId, input.eventId, {
    eventSource: CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED,
    participantCustomerIds: listAllianceParticipantsForEvent(
      storage,
      input.ownerMemberId,
      input.eventId,
    ),
  });
}

export function removeCustomerFromAllianceEvents(
  storage: StorageAdapter,
  ownerMemberId: EntityId | undefined,
  customerId: EntityId,
): void {
  const next = loadAllianceEventParticipants(storage).filter(
    (row) => row.customerId !== customerId,
  );
  persist(storage, next);
  void flushCalendarEventParticipantsCloud(ownerMemberId, undefined, {
    eventSource: CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED,
    removedCustomerId: customerId,
  });
}

export function eventSourceForSharedId(eventId: EntityId): CalendarEventSource {
  return eventId.startsWith("shared:")
    ? CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED
    : CALENDAR_EVENT_SOURCE.PERSONAL;
}
