import {
  DEFAULT_CALENDAR_REMINDER_MINUTES,
  normalizeReminderMinutes,
} from "@/lib/calendar/calendar-reminder-options";
import { defaultRecurrence } from "@/lib/calendar/recurrence";
import { getSharedCalendarEventColor } from "@/lib/calendar/shared-calendars";
import type { CalendarEvent, CalendarEventColor } from "@/types/calendar-event";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { ExpandedCalendarEvent } from "@/types/calendar-event";

export interface SharedCalendarAttendance {
  id: string;
  memberId: string;
  sharedEventId: string;
  googleCalendarId: string;
  googleEventUid: string;
  title: string;
  notes?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: CalendarEventColor;
  activityTypeKey: string;
  reminderMinutes?: number[];
  createdAt: string;
  updatedAt: string;
}

function parseAttendance(raw: string | null): SharedCalendarAttendance[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as SharedCalendarAttendance[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadSharedCalendarAttendance(storage: StorageAdapter): SharedCalendarAttendance[] {
  return parseAttendance(storage.getItem(STORAGE_KEYS.calendarSharedAttendance));
}

/** 將舊版 blue 的 attendance 顏色更新為共用行事曆設定色 */
export function migrateSharedAttendanceColors(storage: StorageAdapter): void {
  const items = loadSharedCalendarAttendance(storage);
  let changed = false;
  const next = items.map((item) => {
    const color = getSharedCalendarEventColor(item.googleCalendarId);
    if (item.color === color) {
      return item;
    }
    changed = true;
    return { ...item, color, updatedAt: new Date().toISOString() };
  });
  if (changed) {
    storage.setItem(STORAGE_KEYS.calendarSharedAttendance, JSON.stringify(next));
  }
}

export function loadMemberSharedCalendarAttendance(
  storage: StorageAdapter,
  memberId: string,
): SharedCalendarAttendance[] {
  return loadSharedCalendarAttendance(storage).filter((item) => item.memberId === memberId);
}

export function isSharedEventAttending(
  storage: StorageAdapter,
  memberId: string,
  sharedEventId: string,
): SharedCalendarAttendance | undefined {
  return loadMemberSharedCalendarAttendance(storage, memberId).find(
    (item) => item.sharedEventId === sharedEventId,
  );
}

export function saveSharedCalendarAttendance(
  storage: StorageAdapter,
  input: Omit<SharedCalendarAttendance, "id" | "createdAt" | "updatedAt"> & { id?: string },
): SharedCalendarAttendance {
  const now = new Date().toISOString();
  const items = loadSharedCalendarAttendance(storage);
  const existingIndex = items.findIndex(
    (item) => item.memberId === input.memberId && item.sharedEventId === input.sharedEventId,
  );

  if (existingIndex >= 0) {
    const updated: SharedCalendarAttendance = {
      ...items[existingIndex],
      ...input,
      updatedAt: now,
    };
    const next = [...items];
    next[existingIndex] = updated;
    storage.setItem(STORAGE_KEYS.calendarSharedAttendance, JSON.stringify(next));
    return updated;
  }

  const created: SharedCalendarAttendance = {
    id: input.id ?? createId(),
    createdAt: now,
    updatedAt: now,
    memberId: input.memberId,
    sharedEventId: input.sharedEventId,
    googleCalendarId: input.googleCalendarId,
    googleEventUid: input.googleEventUid,
    title: input.title,
    notes: input.notes,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay,
    color: input.color,
    activityTypeKey: input.activityTypeKey,
    reminderMinutes: normalizeReminderMinutes(input.reminderMinutes),
  };
  storage.setItem(STORAGE_KEYS.calendarSharedAttendance, JSON.stringify([...items, created]));
  return created;
}

export function removeSharedCalendarAttendance(
  storage: StorageAdapter,
  memberId: string,
  sharedEventId: string,
): void {
  const next = loadSharedCalendarAttendance(storage).filter(
    (item) => !(item.memberId === memberId && item.sharedEventId === sharedEventId),
  );
  storage.setItem(STORAGE_KEYS.calendarSharedAttendance, JSON.stringify(next));
}

export function attendanceToCalendarEvent(attendance: SharedCalendarAttendance): CalendarEvent {
  return {
    id: attendance.sharedEventId,
    createdAt: attendance.createdAt,
    updatedAt: attendance.updatedAt,
    memberId: attendance.memberId,
    title: attendance.title,
    notes: attendance.notes,
    startAt: attendance.startAt,
    endAt: attendance.endAt,
    allDay: attendance.allDay,
    color: getSharedCalendarEventColor(attendance.googleCalendarId),
    activityTypeKey: attendance.activityTypeKey,
    attendedFromShared: true,
    recurrence: defaultRecurrence(),
    googleEventId: attendance.googleEventUid,
    googleCalendarId: attendance.googleCalendarId,
    reminderMinutes: attendance.reminderMinutes,
  };
}

export function attendanceFromExpandedSharedEvent(
  memberId: string,
  event: ExpandedCalendarEvent,
  activityTypeKey: string,
  reminderMinutes?: number[],
): Omit<SharedCalendarAttendance, "id" | "createdAt" | "updatedAt"> {
  return {
    memberId,
    sharedEventId: event.sourceEventId,
    googleCalendarId: event.googleCalendarId ?? "",
    googleEventUid: event.googleEventId ?? event.sourceEventId,
    title: event.title,
    notes: event.notes,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    color: getSharedCalendarEventColor(event.googleCalendarId),
    activityTypeKey,
    reminderMinutes: normalizeReminderMinutes(
      reminderMinutes ?? DEFAULT_CALENDAR_REMINDER_MINUTES,
    ),
  };
}
