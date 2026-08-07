import type { CalendarEvent } from "@/types/calendar-event";
import type { EntityId } from "@/types";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

export interface CalendarEventDeletionTombstone {
  eventId: EntityId;
  deletedAt: string;
}

function parseEvents(raw: string | null): CalendarEvent[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CalendarEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseTombstones(raw: string | null): CalendarEventDeletionTombstone[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CalendarEventDeletionTombstone[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readCalendarEventDeletionTombstones(
  storage: StorageAdapter,
): CalendarEventDeletionTombstone[] {
  return parseTombstones(storage.getItem(STORAGE_KEYS.calendarEventDeletionTombstones));
}

export function readCalendarEventDeletionTombstoneIds(storage: StorageAdapter): Set<EntityId> {
  return new Set(readCalendarEventDeletionTombstones(storage).map((tombstone) => tombstone.eventId));
}

export function addCalendarEventDeletionTombstone(storage: StorageAdapter, eventId: EntityId): void {
  const current = readCalendarEventDeletionTombstones(storage);
  if (current.some((tombstone) => tombstone.eventId === eventId)) {
    return;
  }

  storage.setItem(
    STORAGE_KEYS.calendarEventDeletionTombstones,
    JSON.stringify([...current, { eventId, deletedAt: new Date().toISOString() }]),
  );
}

export function clearCalendarEventDeletionTombstones(storage: StorageAdapter, eventIds: EntityId[]): void {
  if (eventIds.length === 0) {
    return;
  }

  const removeIds = new Set(eventIds);
  const next = readCalendarEventDeletionTombstones(storage).filter(
    (tombstone) => !removeIds.has(tombstone.eventId),
  );
  storage.setItem(STORAGE_KEYS.calendarEventDeletionTombstones, JSON.stringify(next));
}

export function mergeCalendarEventsOnLogin(
  localRaw: string | null,
  cloudRaw: string | null,
  tombstoneIds: Set<EntityId>,
): CalendarEvent[] {
  const merged = new Map<string, CalendarEvent>();

  for (const event of parseEvents(cloudRaw)) {
    if (tombstoneIds.has(event.id)) {
      continue;
    }
    merged.set(event.id, event);
  }

  for (const event of parseEvents(localRaw)) {
    if (tombstoneIds.has(event.id)) {
      continue;
    }

    const existing = merged.get(event.id);
    if (!existing) {
      merged.set(event.id, event);
      continue;
    }

    const localUpdated = new Date(event.updatedAt).getTime();
    const cloudUpdated = new Date(existing.updatedAt).getTime();
    if (localUpdated >= cloudUpdated) {
      merged.set(event.id, event);
    }
  }

  return [...merged.values()];
}
