import { defaultRecurrence } from "@/lib/calendar/recurrence";
import type {
  CalendarEvent,
  CalendarEventCreateInput,
  CalendarEventUpdateInput,
} from "@/types/calendar-event";
import type { EntityId } from "@/types";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";
import { addCalendarEventDeletionTombstone } from "@/lib/calendar/calendar-event-deletion-tombstones";
import { flushPendingCloudSync } from "@/lib/repositories/syncing-storage-adapter";

export interface CalendarEventRepository {
  getAll(): CalendarEvent[];
  getByMemberId(memberId: EntityId): CalendarEvent[];
  getById(eventId: EntityId): CalendarEvent | undefined;
  create(input: CalendarEventCreateInput): CalendarEvent;
  update(eventId: EntityId, input: CalendarEventUpdateInput): CalendarEvent;
  delete(eventId: EntityId): void;
  upsertGoogleEvent(input: CalendarEventCreateInput & { id?: EntityId }): CalendarEvent;
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

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class LocalStorageCalendarEventRepository implements CalendarEventRepository {
  constructor(private readonly storage: StorageAdapter) {}

  getAll(): CalendarEvent[] {
    return parseEvents(this.storage.getItem(STORAGE_KEYS.calendarEvents));
  }

  getByMemberId(memberId: EntityId): CalendarEvent[] {
    return this.getAll().filter((event) => event.memberId === memberId);
  }

  getById(eventId: EntityId): CalendarEvent | undefined {
    return this.getAll().find((event) => event.id === eventId);
  }

  create(input: CalendarEventCreateInput): CalendarEvent {
    const now = new Date().toISOString();
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
    };

    const next = [...this.getAll(), event];
    this.storage.setItem(STORAGE_KEYS.calendarEvents, JSON.stringify(next));
    return event;
  }

  update(eventId: EntityId, input: CalendarEventUpdateInput): CalendarEvent {
    const events = this.getAll();
    const index = events.findIndex((event) => event.id === eventId);
    if (index < 0) {
      throw new Error(`Calendar event not found: ${eventId}`);
    }

    const updated: CalendarEvent = {
      ...events[index],
      ...input,
      title: input.title?.trim() ?? events[index].title,
      notes: input.notes !== undefined ? input.notes.trim() : events[index].notes,
      updatedAt: new Date().toISOString(),
    };

    const next = [...events];
    next[index] = updated;
    this.storage.setItem(STORAGE_KEYS.calendarEvents, JSON.stringify(next));
    return updated;
  }

  delete(eventId: EntityId): void {
    addCalendarEventDeletionTombstone(this.storage, eventId);

    const next = this.getAll().filter((event) => event.id !== eventId);
    this.storage.setItem(STORAGE_KEYS.calendarEvents, JSON.stringify(next));
    flushPendingCloudSync();
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
