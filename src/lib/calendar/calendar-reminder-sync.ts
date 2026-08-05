import { expandEventsForRange } from "@/lib/calendar/recurrence";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { loadMemberSharedCalendarAttendance } from "@/lib/calendar/calendar-attendance-storage";
import { normalizeReminderMinutes } from "@/lib/calendar/calendar-reminder-options";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { CalendarEvent } from "@/types/calendar-event";

export interface ScheduledCalendarReminder {
  id: string;
  memberId: string;
  fireAt: string;
  title: string;
  body: string;
  url: string;
  fired: boolean;
}

const HORIZON_DAYS = 60;

function parseEvents(raw: string | null): ScheduledCalendarReminder[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as ScheduledCalendarReminder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadScheduledCalendarReminders(storage: StorageAdapter): ScheduledCalendarReminder[] {
  return parseEvents(storage.getItem(STORAGE_KEYS.calendarReminderQueue));
}

export function saveScheduledCalendarReminders(
  storage: StorageAdapter,
  reminders: ScheduledCalendarReminder[],
): void {
  storage.setItem(STORAGE_KEYS.calendarReminderQueue, JSON.stringify(reminders));
}

function resolveEventStartMs(startAt: string, allDay: boolean): number {
  if (allDay) {
    return new Date(`${startAt.slice(0, 10)}T09:00:00`).getTime();
  }
  return new Date(`${startAt.slice(0, 16)}:00`).getTime();
}

function formatFireBody(startAt: string, allDay: boolean, minutesBefore: number): string {
  const start = allDay ? `${startAt.slice(0, 10)} 全天` : startAt.slice(11, 16);
  return `${start} 開始 · 提前 ${minutesBefore} 分鐘提醒`;
}

function buildReminderEntries(input: {
  memberId: string;
  sourceKey: string;
  title: string;
  startAt: string;
  allDay: boolean;
  reminderMinutes: number[];
  nowMs: number;
  horizonMs: number;
}): ScheduledCalendarReminder[] {
  const entries: ScheduledCalendarReminder[] = [];
  const startMs = resolveEventStartMs(input.startAt, input.allDay);

  input.reminderMinutes.forEach((minutesBefore) => {
    const fireMs = startMs - minutesBefore * 60 * 1000;
    if (fireMs <= input.nowMs || fireMs > input.horizonMs) {
      return;
    }

    entries.push({
      id: `${input.sourceKey}:${minutesBefore}`,
      memberId: input.memberId,
      fireAt: new Date(fireMs).toISOString(),
      title: input.title,
      body: formatFireBody(input.startAt, input.allDay, minutesBefore),
      url: "/calendar",
      fired: false,
    });
  });

  return entries;
}

function collectPersonalEventReminders(
  memberId: string,
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string,
  nowMs: number,
  horizonMs: number,
): ScheduledCalendarReminder[] {
  const expanded = expandEventsForRange(events, rangeStart, rangeEnd);

  return expanded.flatMap((occurrence) => {
    const source = events.find((event) => event.id === occurrence.sourceEventId);
    const reminderMinutes = normalizeReminderMinutes(source?.reminderMinutes);
    if (reminderMinutes.length === 0) {
      return [];
    }

    return buildReminderEntries({
      memberId,
      sourceKey: `${occurrence.occurrenceId}`,
      title: occurrence.title,
      startAt: occurrence.startAt,
      allDay: occurrence.allDay,
      reminderMinutes,
      nowMs,
      horizonMs,
    });
  });
}

export function syncCalendarReminders(storage: StorageAdapter, memberId?: string): ScheduledCalendarReminder[] {
  const viewerId = memberId ?? resolveAuthenticatedMemberId(storage);
  const now = new Date();
  const nowMs = now.getTime();
  const horizonMs = nowMs + HORIZON_DAYS * 24 * 60 * 60 * 1000;
  const rangeStart = now.toISOString().slice(0, 10);
  const rangeEnd = new Date(horizonMs).toISOString().slice(0, 10);

  const personalEvents = createCalendarEventRepository(storage)
    .getByMemberId(viewerId)
    .filter((event) => !event.attendedFromShared);

  const attendance = loadMemberSharedCalendarAttendance(storage, viewerId);

  const nextEntries = [
    ...collectPersonalEventReminders(viewerId, personalEvents, rangeStart, rangeEnd, nowMs, horizonMs),
    ...attendance.flatMap((item) =>
      buildReminderEntries({
        memberId: viewerId,
        sourceKey: `attendance:${item.sharedEventId}`,
        title: item.title,
        startAt: item.startAt,
        allDay: item.allDay,
        reminderMinutes: normalizeReminderMinutes(item.reminderMinutes),
        nowMs,
        horizonMs,
      }),
    ),
  ];

  const existing = loadScheduledCalendarReminders(storage);
  const firedIds = new Set(existing.filter((item) => item.fired).map((item) => item.id));
  const merged = nextEntries.map((entry) => ({
    ...entry,
    fired: firedIds.has(entry.id),
  }));

  saveScheduledCalendarReminders(storage, merged);
  return merged;
}

export function markCalendarReminderFired(storage: StorageAdapter, reminderId: string): void {
  const next = loadScheduledCalendarReminders(storage).map((item) =>
    item.id === reminderId ? { ...item, fired: true } : item,
  );
  saveScheduledCalendarReminders(storage, next);
}
