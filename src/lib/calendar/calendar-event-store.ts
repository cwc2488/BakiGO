/**
 * App-level calendar event store — survives Calendar page mount/unmount.
 * UI selects slices; do not duplicate full event arrays in page-local state forever.
 */
import type { CalendarEvent } from "@/types/calendar-event";
import type { EntityId } from "@/types";

type Listener = () => void;

interface CalendarStoreState {
  memberId: EntityId | null;
  eventsById: Map<string, CalendarEvent>;
  sharedEventsById: Map<string, CalendarEvent>;
  lastCloudUpdatedAt: string | null;
  hydrated: boolean;
}

const state: CalendarStoreState = {
  memberId: null,
  eventsById: new Map(),
  sharedEventsById: new Map(),
  lastCloudUpdatedAt: null,
  hydrated: false,
};

const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeCalendarStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCalendarStoreSnapshot(): {
  memberId: EntityId | null;
  events: CalendarEvent[];
  sharedEvents: CalendarEvent[];
  lastCloudUpdatedAt: string | null;
  hydrated: boolean;
} {
  return {
    memberId: state.memberId,
    events: [...state.eventsById.values()],
    sharedEvents: [...state.sharedEventsById.values()],
    lastCloudUpdatedAt: state.lastCloudUpdatedAt,
    hydrated: state.hydrated,
  };
}

export function resetCalendarStore(): void {
  state.memberId = null;
  state.eventsById = new Map();
  state.sharedEventsById = new Map();
  state.lastCloudUpdatedAt = null;
  state.hydrated = false;
  emit();
}

export function hydrateCalendarStore(input: {
  memberId: EntityId;
  events: CalendarEvent[];
  sharedEvents?: CalendarEvent[];
  lastCloudUpdatedAt?: string | null;
}): void {
  if (state.memberId && state.memberId !== input.memberId) {
    state.eventsById = new Map();
    state.sharedEventsById = new Map();
  }
  state.memberId = input.memberId;
  state.eventsById = new Map(input.events.map((event) => [event.id, event]));
  if (input.sharedEvents) {
    state.sharedEventsById = new Map(input.sharedEvents.map((event) => [event.id, event]));
  }
  if (input.lastCloudUpdatedAt !== undefined) {
    state.lastCloudUpdatedAt = input.lastCloudUpdatedAt;
  }
  state.hydrated = true;
  emit();
}

/** Upsert by id — never array.push duplicates. */
export function upsertCalendarEvents(events: CalendarEvent[]): void {
  let changed = false;
  for (const event of events) {
    const existing = state.eventsById.get(event.id);
    if (!existing || existing.updatedAt !== event.updatedAt) {
      state.eventsById.set(event.id, event);
      changed = true;
    }
  }
  if (changed) emit();
}

export function removeCalendarEventIds(eventIds: EntityId[]): void {
  let changed = false;
  for (const id of eventIds) {
    if (state.eventsById.delete(id)) changed = true;
  }
  if (changed) emit();
}

export function replaceSharedCalendarEvents(events: CalendarEvent[]): void {
  state.sharedEventsById = new Map(events.map((event) => [event.id, event]));
  emit();
}

export function setCalendarLastCloudUpdatedAt(iso: string | null): void {
  state.lastCloudUpdatedAt = iso;
  emit();
}

export function listPersonalCalendarEventsForMember(memberId: EntityId): CalendarEvent[] {
  return [...state.eventsById.values()].filter((event) => event.memberId === memberId);
}
