import { expandEventsForRange } from "@/lib/calendar/recurrence";
import { normalizeReminderMinutes } from "@/lib/calendar/calendar-reminder-options";
import { todayISODate } from "@/lib/config/app-config";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { claimNotificationDelivery } from "@/lib/push/notification-deliveries";
import { sendPushToUser } from "@/lib/push/send-push";
import { PUSH_SOURCE } from "@/lib/push/types";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import type { CalendarEvent } from "@/types/calendar-event";

/** Look back this far for due reminders so a missed cron tick can catch up once. */
const LOOKBACK_MS = 30 * 60 * 1000;
/** Also scan reminders that become due within this forward grace (clock skew). */
const FORWARD_GRACE_MS = 60 * 1000;
const SCAN_HORIZON_DAYS = 2;

export type DueCalendarPushReminder = {
  memberId: string;
  sourceKey: string;
  scheduledAt: string;
  title: string;
  body: string;
  url: string;
};

/** Interpret calendar wall clock as Asia/Taipei → UTC ms. */
export function taipeiWallStartMs(startAt: string, allDay: boolean): number {
  if (allDay) {
    return Date.parse(`${startAt.slice(0, 10)}T09:00:00+08:00`);
  }
  const wall = startAt.slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) {
    return Number.NaN;
  }
  return Date.parse(`${wall}:00+08:00`);
}

function formatFireBody(startAt: string, allDay: boolean, minutesBefore: number): string {
  const start = allDay ? `${startAt.slice(0, 10)} 全天` : startAt.slice(11, 16);
  return `${start} 開始 · 提前 ${minutesBefore} 分鐘提醒`;
}

function parseCalendarEventsPayload(payload: unknown): CalendarEvent[] {
  let value = payload;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is CalendarEvent => {
    return (
      item != null &&
      typeof item === "object" &&
      typeof (item as CalendarEvent).id === "string" &&
      typeof (item as CalendarEvent).title === "string" &&
      typeof (item as CalendarEvent).startAt === "string"
    );
  });
}

export function collectDueCalendarRemindersForEvents(input: {
  memberId: string;
  events: CalendarEvent[];
  nowMs?: number;
}): DueCalendarPushReminder[] {
  const nowMs = input.nowMs ?? Date.now();
  const windowStart = nowMs - LOOKBACK_MS;
  const windowEnd = nowMs + FORWARD_GRACE_MS;
  const rangeStart = todayISODate(new Date(nowMs - 24 * 60 * 60 * 1000));
  const rangeEnd = todayISODate(new Date(nowMs + SCAN_HORIZON_DAYS * 24 * 60 * 60 * 1000));

  const personal = input.events.filter((event) => !event.attendedFromShared);
  const expanded = expandEventsForRange(personal, rangeStart, rangeEnd);
  const due: DueCalendarPushReminder[] = [];

  for (const occurrence of expanded) {
    const source = personal.find((event) => event.id === occurrence.sourceEventId);
    // Matches client sync: reminder minutes come from the source event.
    const minutesList = normalizeReminderMinutes(source?.reminderMinutes);
    if (minutesList.length === 0) {
      continue;
    }

    const startMs = taipeiWallStartMs(occurrence.startAt, occurrence.allDay);
    if (!Number.isFinite(startMs)) {
      continue;
    }

    for (const minutesBefore of minutesList) {
      const fireMs = startMs - minutesBefore * 60 * 1000;
      if (fireMs < windowStart || fireMs > windowEnd) {
        continue;
      }

      const scheduledAt = new Date(fireMs).toISOString();
      const sourceKey = `${occurrence.occurrenceId}:${minutesBefore}`;
      due.push({
        memberId: input.memberId,
        sourceKey,
        scheduledAt,
        title: occurrence.title || "行程提醒",
        body: formatFireBody(occurrence.startAt, occurrence.allDay, minutesBefore),
        url: "/calendar",
      });
    }
  }

  return due;
}

async function loadActivePushMemberIds(): Promise<string[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("member_id")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return [...new Set((data ?? []).map((row) => String(row.member_id)))];
}

async function loadCalendarEventsForMembers(
  memberIds: string[],
): Promise<Map<string, CalendarEvent[]>> {
  const result = new Map<string, CalendarEvent[]>();
  if (memberIds.length === 0) {
    return result;
  }

  const supabase = createSupabaseServiceClient();
  // Batch in chunks to avoid oversized IN filters.
  const chunkSize = 50;
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("member_app_data")
      .select("member_id, payload")
      .in("member_id", chunk)
      .eq("data_key", STORAGE_KEYS.calendarEvents);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      result.set(String(row.member_id), parseCalendarEventsPayload(row.payload));
    }
  }

  return result;
}

export async function processCalendarPushReminders(input?: {
  limit?: number;
  nowMs?: number;
}): Promise<{ scannedMembers: number; due: number; sent: number; skipped: number }> {
  if (!isSupabaseServiceConfigured()) {
    return { scannedMembers: 0, due: 0, sent: 0, skipped: 0 };
  }

  const limit = Math.max(1, Math.min(200, input?.limit ?? 80));
  const nowMs = input?.nowMs ?? Date.now();
  const memberIds = await loadActivePushMemberIds();
  const eventsByMember = await loadCalendarEventsForMembers(memberIds);

  const allDue: DueCalendarPushReminder[] = [];
  for (const memberId of memberIds) {
    const events = eventsByMember.get(memberId) ?? [];
    allDue.push(
      ...collectDueCalendarRemindersForEvents({ memberId, events, nowMs }),
    );
  }

  let sent = 0;
  let skipped = 0;
  let processed = 0;

  for (const reminder of allDue) {
    if (processed >= limit) {
      break;
    }
    processed += 1;

    const claimed = await claimNotificationDelivery({
      memberId: reminder.memberId,
      sourceType: PUSH_SOURCE.calendarReminder,
      sourceKey: reminder.sourceKey,
      scheduledAt: reminder.scheduledAt,
      title: reminder.title,
      body: reminder.body,
      targetUrl: reminder.url,
    });

    if (!claimed) {
      skipped += 1;
      continue;
    }

    const result = await sendPushToUser({
      memberId: reminder.memberId,
      title: reminder.title,
      body: reminder.body,
      url: reminder.url,
      tag: `calendar:${reminder.sourceKey}`,
    });

    if (result.succeeded > 0) {
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    scannedMembers: memberIds.length,
    due: allDue.length,
    sent,
    skipped,
  };
}
