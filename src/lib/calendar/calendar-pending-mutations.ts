import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { CalendarEvent, CalendarEventCreateInput, CalendarEventUpdateInput } from "@/types/calendar-event";
import type { EntityId } from "@/types";

export type CalendarMutationOp = "create" | "update" | "delete";

export interface CalendarPendingMutation {
  operationId: string;
  eventId: EntityId;
  operation: CalendarMutationOp;
  payload: CalendarEventCreateInput | CalendarEventUpdateInput | null;
  createdAt: string;
  retryCount: number;
}

const PENDING_KEY = "baki-go:calendar-pending-mutations";
const MAX_PENDING = 200;

/** In-memory fallback for SSR / test environments without localStorage. */
let memoryQueue: CalendarPendingMutation[] = [];

function createOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cal-op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readQueue(): CalendarPendingMutation[] {
  if (!canUseLocalStorage()) {
    return memoryQueue.slice(0, MAX_PENDING);
  }
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CalendarPendingMutation[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_PENDING) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: CalendarPendingMutation[]): void {
  const bounded = queue.slice(-MAX_PENDING);
  memoryQueue = bounded;
  if (!canUseLocalStorage()) {
    return;
  }
  if (bounded.length === 0) {
    window.localStorage.removeItem(PENDING_KEY);
    return;
  }
  window.localStorage.setItem(PENDING_KEY, JSON.stringify(bounded));
}

export function listCalendarPendingMutations(): CalendarPendingMutation[] {
  return readQueue();
}

export function enqueueCalendarPendingMutation(
  input: Omit<CalendarPendingMutation, "operationId" | "createdAt" | "retryCount"> & {
    operationId?: string;
  },
): CalendarPendingMutation {
  const queue = readQueue().filter((item) => item.eventId !== input.eventId || item.operation !== input.operation);
  const entry: CalendarPendingMutation = {
    operationId: input.operationId ?? createOperationId(),
    eventId: input.eventId,
    operation: input.operation,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  writeQueue([...queue, entry]);
  return entry;
}

export function removeCalendarPendingMutation(operationId: string): void {
  writeQueue(readQueue().filter((item) => item.operationId !== operationId));
}

export function bumpCalendarPendingRetry(operationId: string): void {
  writeQueue(
    readQueue().map((item) =>
      item.operationId === operationId ? { ...item, retryCount: item.retryCount + 1 } : item,
    ),
  );
}

export function clearCalendarPendingMutations(): void {
  writeQueue([]);
}

/** Tiny cursor/meta only — never store the full event database here. */
export function readCalendarLastSyncAt(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEYS.calendarEvents + ":last-sync-at");
}

export function writeCalendarLastSyncAt(iso: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS.calendarEvents + ":last-sync-at", iso);
}
