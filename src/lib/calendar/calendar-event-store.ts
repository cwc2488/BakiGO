/**
 * App-level calendar event store — survives Calendar page mount/unmount.
 * Personal events are range-bounded (LRU + TTL + max range count).
 * UI selects slices; do not duplicate full event arrays in page-local state forever.
 */
import type { CalendarEvent } from "@/types/calendar-event";
import type { EntityId } from "@/types";

type Listener = () => void;

interface RangeMeta {
  key: string;
  rangeStart: string;
  rangeEnd: string;
  eventIds: Set<string>;
  lastAccessAt: number;
  expiresAt: number;
}

interface CalendarStoreState {
  memberId: EntityId | null;
  eventsById: Map<string, CalendarEvent>;
  sharedEventsById: Map<string, CalendarEvent>;
  ranges: Map<string, RangeMeta>;
  lastCloudUpdatedAt: string | null;
  hydrated: boolean;
}

const MAX_PERSONAL_RANGES = 6;
const RANGE_TTL_MS = 6 * 60 * 60 * 1000;

const state: CalendarStoreState = {
  memberId: null,
  eventsById: new Map(),
  sharedEventsById: new Map(),
  ranges: new Map(),
  lastCloudUpdatedAt: null,
  hydrated: false,
};

const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function makePersonalRangeKey(input: {
  memberId: string;
  rangeStart: string;
  rangeEnd: string;
}): string {
  return `personal:${input.memberId}:${input.rangeStart}:${input.rangeEnd}`;
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
  personalEventCount: number;
  personalRangeCount: number;
} {
  return {
    memberId: state.memberId,
    events: [...state.eventsById.values()],
    sharedEvents: [...state.sharedEventsById.values()],
    lastCloudUpdatedAt: state.lastCloudUpdatedAt,
    hydrated: state.hydrated,
    personalEventCount: state.eventsById.size,
    personalRangeCount: state.ranges.size,
  };
}

export function resetCalendarStore(): void {
  state.memberId = null;
  state.eventsById = new Map();
  state.sharedEventsById = new Map();
  state.ranges = new Map();
  state.lastCloudUpdatedAt = null;
  state.hydrated = false;
  emit();
}

function evictExpiredAndOverflowRanges(): void {
  const now = Date.now();
  const removedEventIds = new Set<string>();
  for (const [key, meta] of state.ranges) {
    if (now > meta.expiresAt) {
      for (const id of meta.eventIds) {
        removedEventIds.add(id);
      }
      state.ranges.delete(key);
    }
  }
  while (state.ranges.size > MAX_PERSONAL_RANGES) {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;
    for (const [key, meta] of state.ranges) {
      if (meta.lastAccessAt < oldestAccess) {
        oldestAccess = meta.lastAccessAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    const meta = state.ranges.get(oldestKey);
    if (meta) {
      for (const id of meta.eventIds) {
        removedEventIds.add(id);
      }
    }
    state.ranges.delete(oldestKey);
  }

  if (state.ranges.size === 0) {
    // No tracked ranges: keep events already in memory (fresh writes / tests).
    return;
  }

  const retainedIds = new Set<string>();
  for (const meta of state.ranges.values()) {
    for (const id of meta.eventIds) {
      retainedIds.add(id);
    }
  }
  for (const id of removedEventIds) {
    if (!retainedIds.has(id)) {
      state.eventsById.delete(id);
    }
  }
  for (const id of [...state.eventsById.keys()]) {
    if (!retainedIds.has(id)) {
      state.eventsById.delete(id);
    }
  }
}

/** Upsert by id — never array.push duplicates. Keeps event pinned to a range. */
export function upsertCalendarEvents(events: CalendarEvent[]): void {
  let changed = false;
  for (const event of events) {
    if (!state.memberId) {
      state.memberId = event.memberId;
    }
    const existing = state.eventsById.get(event.id);
    // Always replace by id. Do not skip when updatedAt collides within the same ms.
    if (
      !existing ||
      existing.updatedAt !== event.updatedAt ||
      existing.title !== event.title ||
      JSON.stringify(existing.participantCustomerIds ?? []) !==
        JSON.stringify(event.participantCustomerIds ?? []) ||
      existing.startAt !== event.startAt ||
      existing.endAt !== event.endAt ||
      existing.notes !== event.notes ||
      existing.color !== event.color ||
      existing.activityTypeKey !== event.activityTypeKey
    ) {
      state.eventsById.set(event.id, event);
      changed = true;
    } else {
      // Still refresh reference for callers that mutate via new object identity.
      state.eventsById.set(event.id, event);
    }
    let newest: RangeMeta | null = null;
    for (const meta of state.ranges.values()) {
      if (!newest || meta.lastAccessAt > newest.lastAccessAt) {
        newest = meta;
      }
    }
    if (newest) {
      newest.eventIds.add(event.id);
      newest.lastAccessAt = Date.now();
    } else {
      const key = makePersonalRangeKey({
        memberId: event.memberId,
        rangeStart: event.startAt.slice(0, 10),
        rangeEnd: event.endAt.slice(0, 10),
      });
      state.ranges.set(key, {
        key,
        rangeStart: event.startAt.slice(0, 10),
        rangeEnd: event.endAt.slice(0, 10),
        eventIds: new Set([event.id]),
        lastAccessAt: Date.now(),
        expiresAt: Date.now() + RANGE_TTL_MS,
      });
    }
  }
  if (changed || events.length > 0) {
    state.hydrated = true;
    evictExpiredAndOverflowRanges();
    emit();
  }
}

/** Replace/merge events for a visible range and bind them to that range key. */
export function hydratePersonalCalendarRange(input: {
  memberId: EntityId;
  rangeStart: string;
  rangeEnd: string;
  events: CalendarEvent[];
  lastCloudUpdatedAt?: string | null;
}): void {
  if (state.memberId && state.memberId !== input.memberId) {
    state.eventsById = new Map();
    state.sharedEventsById = new Map();
    state.ranges = new Map();
  }
  state.memberId = input.memberId;
  const key = makePersonalRangeKey(input);
  const eventIds = new Set<string>();
  for (const event of input.events) {
    if (event.memberId !== input.memberId) continue;
    const existing = state.eventsById.get(event.id);
    if (!existing || event.updatedAt >= existing.updatedAt) {
      state.eventsById.set(event.id, event);
    }
    eventIds.add(event.id);
  }
  state.ranges.set(key, {
    key,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    eventIds,
    lastAccessAt: Date.now(),
    expiresAt: Date.now() + RANGE_TTL_MS,
  });
  if (input.lastCloudUpdatedAt !== undefined) {
    state.lastCloudUpdatedAt = input.lastCloudUpdatedAt;
  }
  state.hydrated = true;
  evictExpiredAndOverflowRanges();
  emit();
}

/**
 * @deprecated Prefer hydratePersonalCalendarRange — full hydrate is unbounded.
 * Kept for migration/tests; still runs through range eviction after assign.
 */
export function hydrateCalendarStore(input: {
  memberId: EntityId;
  events: CalendarEvent[];
  sharedEvents?: CalendarEvent[];
  lastCloudUpdatedAt?: string | null;
}): void {
  if (state.memberId && state.memberId !== input.memberId) {
    state.eventsById = new Map();
    state.sharedEventsById = new Map();
    state.ranges = new Map();
  }
  state.memberId = input.memberId;
  for (const event of input.events) {
    state.eventsById.set(event.id, event);
  }
  // Bind into a synthetic "open" range so eviction still has a trackable set.
  const ids = new Set(input.events.map((event) => event.id));
  const key = makePersonalRangeKey({
    memberId: input.memberId,
    rangeStart: "0000-01-01",
    rangeEnd: "9999-12-31",
  });
  state.ranges.set(key, {
    key,
    rangeStart: "0000-01-01",
    rangeEnd: "9999-12-31",
    eventIds: ids,
    lastAccessAt: Date.now(),
    expiresAt: Date.now() + RANGE_TTL_MS,
  });
  if (input.sharedEvents) {
    state.sharedEventsById = new Map(input.sharedEvents.map((event) => [event.id, event]));
  }
  if (input.lastCloudUpdatedAt !== undefined) {
    state.lastCloudUpdatedAt = input.lastCloudUpdatedAt;
  }
  state.hydrated = true;
  evictExpiredAndOverflowRanges();
  emit();
}

export function removeCalendarEventIds(eventIds: EntityId[]): void {
  let changed = false;
  for (const id of eventIds) {
    if (state.eventsById.delete(id)) changed = true;
    for (const meta of state.ranges.values()) {
      meta.eventIds.delete(id);
    }
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

export function listPersonalCalendarEventsInRange(
  memberId: EntityId,
  rangeStart: string,
  rangeEnd: string,
): CalendarEvent[] {
  const key = makePersonalRangeKey({ memberId, rangeStart, rangeEnd });
  const meta = state.ranges.get(key);
  if (meta) {
    meta.lastAccessAt = Date.now();
  }
  return [...state.eventsById.values()].filter((event) => {
    if (event.memberId !== memberId) return false;
    // Recurring series may start before the window.
    if (event.recurrence && event.recurrence.frequency !== "none") {
      return event.startAt.slice(0, 10) <= rangeEnd;
    }
    const start = event.startAt.slice(0, 10);
    const end = event.endAt.slice(0, 10);
    return end >= rangeStart && start <= rangeEnd;
  });
}

export function touchPersonalCalendarRange(
  memberId: EntityId,
  rangeStart: string,
  rangeEnd: string,
): void {
  const key = makePersonalRangeKey({ memberId, rangeStart, rangeEnd });
  const meta = state.ranges.get(key);
  if (meta) {
    meta.lastAccessAt = Date.now();
  }
}

export function getPersonalCalendarRangeCount(): number {
  return state.ranges.size;
}

export function getPersonalCalendarEventCount(): number {
  return state.eventsById.size;
}

export function isPersonalCalendarRangeFresh(
  memberId: EntityId,
  rangeStart: string,
  rangeEnd: string,
  nowMs = Date.now(),
): boolean {
  const key = makePersonalRangeKey({ memberId, rangeStart, rangeEnd });
  const meta = state.ranges.get(key);
  if (!meta) return false;
  if (nowMs > meta.expiresAt) return false;
  meta.lastAccessAt = nowMs;
  return true;
}

function eventOverlapsRange(event: CalendarEvent, rangeStart: string, rangeEnd: string): boolean {
  if (event.recurrence && event.recurrence.frequency !== "none") {
    return event.startAt.slice(0, 10) <= rangeEnd;
  }
  const start = event.startAt.slice(0, 10);
  const end = event.endAt.slice(0, 10);
  return end >= rangeStart && start <= rangeEnd;
}

/** True when event overlaps any currently loaded (non-expired) personal range. */
export function eventBelongsToActivePersonalRanges(event: CalendarEvent, nowMs = Date.now()): boolean {
  for (const meta of state.ranges.values()) {
    if (nowMs > meta.expiresAt) continue;
    if (eventOverlapsRange(event, meta.rangeStart, meta.rangeEnd)) {
      return true;
    }
  }
  return false;
}

/**
 * Upsert only events that belong to an active loaded range.
 * Fresh local writes (create/update) should call upsertCalendarEvents directly.
 */
export function upsertCalendarEventsIfInActiveRanges(events: CalendarEvent[]): void {
  const accepted = events.filter((event) => eventBelongsToActivePersonalRanges(event));
  if (accepted.length === 0) return;
  upsertCalendarEvents(accepted);
}

export const CALENDAR_STORE_MAX_PERSONAL_RANGES = MAX_PERSONAL_RANGES;
export const CALENDAR_STORE_RANGE_TTL_MS = RANGE_TTL_MS;
