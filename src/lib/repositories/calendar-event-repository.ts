import { defaultRecurrence } from "@/lib/calendar/recurrence";
import {
  uniqueCustomerIds,
  withParticipantAdded,
  withParticipantRemoved,
  stripCustomerFromAllEvents,
} from "@/lib/calendar/calendar-event-participants";
import {
  enqueueCalendarPendingMutation,
  listCalendarPendingMutations,
} from "@/lib/calendar/calendar-pending-mutations";
import {
  listPersonalCalendarEventsForMember,
  removeCalendarEventIds,
  upsertCalendarEvents,
  getCalendarStoreSnapshot,
} from "@/lib/calendar/calendar-event-store";
import { trackCalendarEventCloudWrite } from "@/lib/calendar/calendar-event-cloud-write-tracker";
import {
  softDeleteCloudCalendarEvent,
  upsertCloudCalendarEvent,
} from "@/lib/cloud/calendar-events-cloud-service";
import { flushCalendarEventParticipantsCloud } from "@/lib/cloud/calendar-event-participants-cloud";
import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  CalendarEvent,
  CalendarEventCreateInput,
  CalendarEventUpdateInput,
} from "@/types/calendar-event";
import type { EntityId } from "@/types";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";
import { addCalendarEventDeletionTombstone } from "@/lib/calendar/calendar-event-deletion-tombstones";
import { boundSharedCalendarEventsForLocalCache } from "@/lib/calendar/calendar-storage-bounds";

export interface CalendarEventRepository {
  getAll(): CalendarEvent[];
  getByMemberId(memberId: EntityId): CalendarEvent[];
  getById(eventId: EntityId): CalendarEvent | undefined;
  create(input: CalendarEventCreateInput): CalendarEvent;
  update(eventId: EntityId, input: CalendarEventUpdateInput): CalendarEvent;
  delete(eventId: EntityId): void;
  upsertGoogleEvent(input: CalendarEventCreateInput & { id?: EntityId }): CalendarEvent;
  addParticipant(eventId: EntityId, customerId: EntityId): CalendarEvent;
  removeParticipant(eventId: EntityId, customerId: EntityId): CalendarEvent;
  removeCustomerFromAllEvents(customerId: EntityId): void;
}

/** Soft cap for any remaining local mirror (~chars). Never store unbounded history. */
const LOCAL_MIRROR_MAX_CHARS = 400_000;

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

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function shouldUseCloud(memberId: EntityId): boolean {
  return isSupabaseConfigured() && isCloudDatabaseMemberId(memberId);
}

/**
 * Bounded local mirror for offline / cold start.
 * Never writes the full historical calendar into localStorage.
 */
function writeBoundedLocalMirror(storage: StorageAdapter, events: CalendarEvent[]): void {
  const bounded = boundSharedCalendarEventsForLocalCache(events, {
    maxChars: LOCAL_MIRROR_MAX_CHARS,
  });
  try {
    // Local-only mirror — never the syncable legacy blob key.
    storage.setItem(STORAGE_KEYS.calendarEventsLocalMirror, JSON.stringify(bounded));
    // Stop growing the legacy last-write-wins blob.
    storage.removeItem(STORAGE_KEYS.calendarEvents);
  } catch {
    try {
      storage.removeItem(STORAGE_KEYS.calendarEventsLocalMirror);
      storage.removeItem(STORAGE_KEYS.calendarEvents);
    } catch {
      /* ignore */
    }
  }
}

function readLegacyOrMirror(storage: StorageAdapter): CalendarEvent[] {
  const mirror = parseEvents(storage.getItem(STORAGE_KEYS.calendarEventsLocalMirror));
  if (mirror.length > 0) {
    return mirror;
  }
  return parseEvents(storage.getItem(STORAGE_KEYS.calendarEvents));
}

function persistMirrorFromStore(storage: StorageAdapter, memberId?: EntityId): void {
  const snapshot = getCalendarStoreSnapshot();
  const events = memberId
    ? snapshot.events.filter((event) => event.memberId === memberId)
    : snapshot.events;
  writeBoundedLocalMirror(storage, events);
}

function queueOfflineMutation(input: {
  eventId: EntityId;
  operation: "create" | "update" | "delete";
  payload: CalendarEventCreateInput | CalendarEventUpdateInput | CalendarEvent | null;
}): void {
  enqueueCalendarPendingMutation({
    eventId: input.eventId,
    operation: input.operation,
    payload: input.payload as CalendarEventCreateInput | CalendarEventUpdateInput | null,
  });
}

async function persistEventToCloud(event: CalendarEvent, operation: "create" | "update"): Promise<void> {
  if (!shouldUseCloud(event.memberId)) {
    return;
  }
  if (!isOnline()) {
    queueOfflineMutation({
      eventId: event.id,
      operation,
      payload: event,
    });
    return;
  }
  await trackCalendarEventCloudWrite(event.memberId, event.id, "upsert", async () => {
    await upsertCloudCalendarEvent(event);
  });
}

async function persistDeleteToCloud(memberId: EntityId, eventId: EntityId): Promise<void> {
  if (!shouldUseCloud(memberId)) {
    return;
  }
  if (!isOnline()) {
    queueOfflineMutation({
      eventId,
      operation: "delete",
      payload: null,
    });
    return;
  }
  await trackCalendarEventCloudWrite(memberId, eventId, "delete", async () => {
    await softDeleteCloudCalendarEvent({ memberId, eventId });
  });
}

export class LocalStorageCalendarEventRepository implements CalendarEventRepository {
  constructor(private readonly storage: StorageAdapter) {}

  /**
   * Prefer app-level store (bounded). Fall back to legacy/mirror localStorage once.
   * Does not load unbounded cloud history.
   */
  getAll(): CalendarEvent[] {
    const fromStore = getCalendarStoreSnapshot().events;
    if (fromStore.length > 0) {
      return fromStore;
    }
    return readLegacyOrMirror(this.storage);
  }

  getByMemberId(memberId: EntityId): CalendarEvent[] {
    const fromStore = listPersonalCalendarEventsForMember(memberId);
    if (fromStore.length > 0) {
      return fromStore;
    }
    const legacy = readLegacyOrMirror(this.storage).filter((event) => event.memberId === memberId);
    if (legacy.length > 0) {
      upsertCalendarEvents(legacy);
      return listPersonalCalendarEventsForMember(memberId);
    }
    return fromStore;
  }

  getById(eventId: EntityId): CalendarEvent | undefined {
    const fromStore = getCalendarStoreSnapshot().events.find((event) => event.id === eventId);
    if (fromStore) return fromStore;
    const legacy = this.getAll().find((event) => event.id === eventId);
    return legacy;
  }

  create(input: CalendarEventCreateInput): CalendarEvent {
    const now = new Date().toISOString();
    const participantCustomerIds = uniqueCustomerIds(input.participantCustomerIds);
    const event: CalendarEvent = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      memberId: input.memberId,
      title: input.title.trim(),
      notes: input.notes?.trim(),
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay ?? false,
      color: input.color,
      recurrence: input.recurrence ?? defaultRecurrence(),
      recurrenceExceptions: input.recurrenceExceptions,
      activityTypeKey: input.activityTypeKey,
      attendedFromShared: input.attendedFromShared,
      googleEventId: input.googleEventId,
      googleCalendarId: input.googleCalendarId,
      reminderMinutes: input.reminderMinutes,
      participantCustomerIds:
        participantCustomerIds.length > 0 ? participantCustomerIds : undefined,
    };

    upsertCalendarEvents([event]);
    persistMirrorFromStore(this.storage, event.memberId);
    void persistEventToCloud(event, "create");
    void flushCalendarEventParticipantsCloud(event.memberId, event.id, {
      eventSource: "personal",
      participantCustomerIds: event.participantCustomerIds,
    });
    return event;
  }

  update(eventId: EntityId, input: CalendarEventUpdateInput): CalendarEvent {
    const existing = this.getById(eventId);
    if (!existing) {
      throw new Error(`Calendar event not found: ${eventId}`);
    }

    const nextParticipants =
      input.participantCustomerIds !== undefined
        ? uniqueCustomerIds(input.participantCustomerIds)
        : uniqueCustomerIds(existing.participantCustomerIds);

    const updated: CalendarEvent = {
      ...existing,
      ...input,
      title: input.title?.trim() ?? existing.title,
      notes: input.notes !== undefined ? input.notes.trim() : existing.notes,
      participantCustomerIds: nextParticipants.length > 0 ? nextParticipants : undefined,
      updatedAt: new Date().toISOString(),
    };

    upsertCalendarEvents([updated]);
    persistMirrorFromStore(this.storage, updated.memberId);
    void persistEventToCloud(updated, "update");
    if (input.participantCustomerIds !== undefined) {
      void flushCalendarEventParticipantsCloud(updated.memberId, updated.id, {
        eventSource: "personal",
        participantCustomerIds: updated.participantCustomerIds,
      });
    }
    return updated;
  }

  delete(eventId: EntityId): void {
    addCalendarEventDeletionTombstone(this.storage, eventId);
    const existing = this.getById(eventId);
    removeCalendarEventIds([eventId]);
    if (existing) {
      persistMirrorFromStore(this.storage, existing.memberId);
      void persistDeleteToCloud(existing.memberId, eventId);
      void flushCalendarEventParticipantsCloud(existing.memberId, eventId, {
        eventSource: "personal",
        deleted: true,
      });
    } else {
      persistMirrorFromStore(this.storage);
    }
  }

  addParticipant(eventId: EntityId, customerId: EntityId): CalendarEvent {
    const event = this.getById(eventId);
    if (!event) {
      throw new Error(`Calendar event not found: ${eventId}`);
    }
    const updated = withParticipantAdded(event, customerId);
    return this.update(eventId, {
      participantCustomerIds: updated.participantCustomerIds ?? [],
    });
  }

  removeParticipant(eventId: EntityId, customerId: EntityId): CalendarEvent {
    const event = this.getById(eventId);
    if (!event) {
      throw new Error(`Calendar event not found: ${eventId}`);
    }
    const updated = withParticipantRemoved(event, customerId);
    return this.update(eventId, {
      participantCustomerIds: updated.participantCustomerIds ?? [],
    });
  }

  removeCustomerFromAllEvents(customerId: EntityId): void {
    const events = this.getAll();
    const ownerId = events.find((e) =>
      uniqueCustomerIds(e.participantCustomerIds).includes(customerId),
    )?.memberId;
    const next = stripCustomerFromAllEvents(events, customerId);
    const changed = next.filter((event) => {
      const before = events.find((e) => e.id === event.id);
      return JSON.stringify(before?.participantCustomerIds ?? []) !==
        JSON.stringify(event.participantCustomerIds ?? []);
    });
    if (changed.length > 0) {
      upsertCalendarEvents(changed);
      for (const event of changed) {
        void persistEventToCloud(event, "update");
      }
      if (ownerId) {
        persistMirrorFromStore(this.storage, ownerId);
      }
    }
    void flushCalendarEventParticipantsCloud(ownerId, undefined, {
      eventSource: "personal",
      removedCustomerId: customerId,
    });
  }

  upsertGoogleEvent(input: CalendarEventCreateInput & { id?: EntityId }): CalendarEvent {
    if (input.googleEventId) {
      const existing = this.getAll().find(
        (event) =>
          event.googleEventId === input.googleEventId &&
          event.googleCalendarId === input.googleCalendarId,
      );
      if (existing) {
        return this.update(existing.id, input);
      }
    }
    if (input.id) {
      const existing = this.getById(input.id);
      if (existing) {
        return this.update(existing.id, input);
      }
    }
    return this.create(input);
  }
}

export function createCalendarEventRepository(storage: StorageAdapter): CalendarEventRepository {
  return new LocalStorageCalendarEventRepository(storage);
}

/** Clear legacy unbounded blob after successful cloud migration. */
export function clearLegacyCalendarEventsBlob(storage: StorageAdapter): void {
  storage.removeItem(STORAGE_KEYS.calendarEvents);
}

export function readLegacyCalendarEventsBlob(storage: StorageAdapter): CalendarEvent[] {
  return readLegacyOrMirror(storage);
}

export function getPendingCalendarMutationCount(): number {
  return listCalendarPendingMutations().length;
}
