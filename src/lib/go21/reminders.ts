import {
  GO21_MAX_REMINDERS_PER_DAY,
  GO21_QUIET_HOURS,
  GO21_REENGAGEMENT_IDLE_DAYS,
  GO21_REMINDER_COOLDOWN_HOURS,
  type Go21ReminderKind,
} from "@/types/go21";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";

export type Go21ReminderPolicy = {
  quietStartHour: number;
  quietEndHour: number;
  maxPerDay: number;
  cooldownHours: number;
  reengagementIdleDays: number;
};

export const DEFAULT_GO21_REMINDER_POLICY: Go21ReminderPolicy = {
  quietStartHour: GO21_QUIET_HOURS.startHour,
  quietEndHour: GO21_QUIET_HOURS.endHour,
  maxPerDay: GO21_MAX_REMINDERS_PER_DAY,
  cooldownHours: GO21_REMINDER_COOLDOWN_HOURS,
  reengagementIdleDays: GO21_REENGAGEMENT_IDLE_DAYS,
};

/** True if Taipei local hour is inside quiet hours (wraps midnight). */
export function isGo21QuietHour(
  hourTaipei: number,
  policy: Go21ReminderPolicy = DEFAULT_GO21_REMINDER_POLICY,
): boolean {
  const { quietStartHour, quietEndHour } = policy;
  if (quietStartHour === quietEndHour) return false;
  if (quietStartHour > quietEndHour) {
    return hourTaipei >= quietStartHour || hourTaipei < quietEndHour;
  }
  return hourTaipei >= quietStartHour && hourTaipei < quietEndHour;
}

export function taipeiHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
}

export function taipeiDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function nextGo21DeliveryAt(input: {
  desiredAt: Date;
  now?: Date;
  policy?: Go21ReminderPolicy;
}): Date {
  const policy = input.policy ?? DEFAULT_GO21_REMINDER_POLICY;
  const candidate = new Date(Math.max(input.desiredAt.getTime(), (input.now ?? new Date()).getTime()));
  for (let i = 0; i < 48; i += 1) {
    if (!isGo21QuietHour(taipeiHour(candidate), policy)) {
      return candidate;
    }
    candidate.setTime(candidate.getTime() + 60 * 60 * 1000);
  }
  return candidate;
}

export function buildDeterministicReminderPreview(input: {
  kind: Go21ReminderKind;
  openLoopSubject?: string | null;
  dayNumber?: number | null;
}): string {
  switch (input.kind) {
    case "open_loop":
      return input.openLoopSubject
        ? `還記得我們說要看的「${input.openLoopSubject}」嗎？有空回我一下就好。`
        : "有件事我們昨天約好要再看一下，有空回我一聲。";
    case "measurement_day7":
      return "第 7 天了。若方便，可以做一次身體數據回測；不方便也能稍後再量。";
    case "measurement_day14":
      return "第 14 天可以選擇回測一次。這不是考試，有量就記錄，沒量也繼續陪跑。";
    case "measurement_day21":
      return "21 天快結束了。有空的話做最終回測；沒量也沒關係，我會用這段時間的紀錄幫你做回顧。";
    case "experiment":
      return input.openLoopSubject
        ? `實驗提醒：${input.openLoopSubject}`
        : "今天要不要試一下我們說好的小調整？";
    case "reengagement":
      return "這幾天比較少聽到你。不用補完美紀錄，回來說一句近況就好。";
    case "daily_light":
    default:
      return "今天過得怎麼樣？吃了什麼或想聊的，直接跟我說就好。";
  }
}

export function shouldScheduleMeasurementReminder(dayNumber: number): Go21ReminderKind | null {
  if (dayNumber === 7) return "measurement_day7";
  if (dayNumber === 14) return "measurement_day14";
  if (dayNumber === 21) return "measurement_day21";
  return null;
}

export function reengagementDueDate(lastActiveLogDate: string | null | undefined): string | null {
  if (!lastActiveLogDate) return null;
  return addCalendarDays(lastActiveLogDate, DEFAULT_GO21_REMINDER_POLICY.reengagementIdleDays);
}

export function isReengagementDue(
  lastActiveLogDate: string | null | undefined,
  today = coachingTodayLogDate(),
): boolean {
  const due = reengagementDueDate(lastActiveLogDate);
  return Boolean(due && today >= due);
}

export function canDeliverReminderNow(input: {
  now?: Date;
  deliveredTodayCount: number;
  lastDeliveredAt: Date | null;
  cycleCompleted: boolean;
  policy?: Go21ReminderPolicy;
}): { ok: boolean; reason?: string } {
  const policy = input.policy ?? DEFAULT_GO21_REMINDER_POLICY;
  const now = input.now ?? new Date();
  if (input.cycleCompleted) return { ok: false, reason: "cycle_completed" };
  if (isGo21QuietHour(taipeiHour(now), policy)) return { ok: false, reason: "quiet_hours" };
  if (input.deliveredTodayCount >= policy.maxPerDay) return { ok: false, reason: "daily_cap" };
  if (input.lastDeliveredAt) {
    const hours =
      (now.getTime() - input.lastDeliveredAt.getTime()) / (1000 * 60 * 60);
    if (hours < policy.cooldownHours) return { ok: false, reason: "cooldown" };
  }
  return { ok: true };
}

export type Go21ReminderRow = {
  id: string;
  enrollment_id: string;
  customer_id: string;
  owner_member_id: string;
  kind: Go21ReminderKind;
  status: string;
  due_at: string;
  message_preview: string | null;
  context_json: Record<string, unknown> | null;
  related_open_loop_id: string | null;
};

/**
 * Suppress obsolete reminders before delivery.
 */
export async function shouldSuppressReminder(input: {
  reminder: Go21ReminderRow;
  lifecycleDay: number | null;
  cycleStatus: string | null;
  hasMeasurementNearCheckpoint: boolean;
  openLoopResolved: boolean;
}): Promise<{ suppress: boolean; reason?: string }> {
  if (input.reminder.status !== "scheduled") {
    return { suppress: true, reason: "not_scheduled" };
  }
  if (input.cycleStatus && input.cycleStatus !== "active") {
    return { suppress: true, reason: "cycle_not_active" };
  }
  if (
    (input.reminder.kind === "measurement_day7" ||
      input.reminder.kind === "measurement_day14" ||
      input.reminder.kind === "measurement_day21") &&
    input.hasMeasurementNearCheckpoint
  ) {
    return { suppress: true, reason: "measurement_already_done" };
  }
  if (input.reminder.kind === "open_loop" && input.openLoopResolved) {
    return { suppress: true, reason: "open_loop_resolved" };
  }
  return { suppress: false };
}

export async function scheduleGo21ReminderIntent(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  kind: Go21ReminderKind;
  dueAt: Date;
  messagePreview: string;
  contextJson?: Record<string, unknown>;
  relatedOpenLoopId?: string | null;
}): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("coaching_ai_reminders").insert({
    enrollment_id: input.enrollmentId,
    customer_id: input.customerId,
    owner_member_id: input.ownerMemberId,
    kind: input.kind,
    status: "scheduled",
    due_at: input.dueAt.toISOString(),
    quiet_hours_respected: true,
    message_preview: input.messagePreview.slice(0, 400),
    context_json: input.contextJson ?? {},
    related_open_loop_id: input.relatedOpenLoopId ?? null,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      console.info(
        JSON.stringify({
          event: "go21_reminder_duplicate_suppressed",
          enrollmentId: input.enrollmentId,
          kind: input.kind,
        }),
      );
      return { ok: true, duplicate: true };
    }
    console.error(
      JSON.stringify({
        event: "go21_reminder_schedule_failed",
        enrollmentId: input.enrollmentId,
        kind: input.kind,
        error: error.message,
      }),
    );
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Deliver due reminders for one enrollment into coaching_ai_turns (in-app coach messages).
 */
export async function deliverDueGo21RemindersForEnrollment(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  lifecycleDay: number | null;
  lifecycleAnchorDate: string;
  cycleStatus?: string | null;
  now?: Date;
}): Promise<{ delivered: number; suppressed: number }> {
  const now = input.now ?? new Date();
  const supabase = createSupabaseServiceClient();
  let delivered = 0;
  let suppressed = 0;

  const gate = await loadDeliveryGate({
    enrollmentId: input.enrollmentId,
    now,
  });
  const deliverability = canDeliverReminderNow({
    now,
    deliveredTodayCount: gate.deliveredTodayCount,
    lastDeliveredAt: gate.lastDeliveredAt,
    cycleCompleted: input.cycleStatus === "completed",
  });
  if (!deliverability.ok) {
    return { delivered: 0, suppressed: 0 };
  }

  const { data: dueRows, error } = await supabase
    .from("coaching_ai_reminders")
    .select(
      "id, enrollment_id, customer_id, owner_member_id, kind, status, due_at, message_preview, context_json, related_open_loop_id",
    )
    .eq("enrollment_id", input.enrollmentId)
    .eq("status", "scheduled")
    .lte("due_at", now.toISOString())
    .order("due_at", { ascending: true })
    .limit(5);

  if (error) {
    console.error(
      JSON.stringify({
        event: "go21_reminder_claim_failed",
        enrollmentId: input.enrollmentId,
        error: error.message,
      }),
    );
    return { delivered: 0, suppressed: 0 };
  }

  for (const row of dueRows ?? []) {
    const reminder = row as Go21ReminderRow;
    const measurementDone = await hasMeasurementNearCheckpoint({
      customerId: input.customerId,
      lifecycleAnchorDate: input.lifecycleAnchorDate,
      kind: reminder.kind,
    });
    const openLoopResolved = reminder.related_open_loop_id
      ? await isOpenLoopResolved(reminder.related_open_loop_id)
      : false;

    const decision = await shouldSuppressReminder({
      reminder,
      lifecycleDay: input.lifecycleDay,
      cycleStatus: input.cycleStatus ?? "active",
      hasMeasurementNearCheckpoint: measurementDone,
      openLoopResolved,
    });

    if (decision.suppress) {
      await supabase
        .from("coaching_ai_reminders")
        .update({
          status: "suppressed",
          cancelled_at: now.toISOString(),
          updated_at: now.toISOString(),
          context_json: {
            ...(reminder.context_json ?? {}),
            suppressReason: decision.reason,
          },
        })
        .eq("id", reminder.id)
        .eq("enrollment_id", input.enrollmentId);
      suppressed += 1;
      continue;
    }

    // Re-check caps after each delivery
    const liveGate = await loadDeliveryGate({ enrollmentId: input.enrollmentId, now });
    const live = canDeliverReminderNow({
      now,
      deliveredTodayCount: liveGate.deliveredTodayCount,
      lastDeliveredAt: liveGate.lastDeliveredAt,
      cycleCompleted: input.cycleStatus === "completed",
    });
    if (!live.ok) break;

    const subject =
      typeof reminder.context_json?.subject === "string"
        ? reminder.context_json.subject
        : null;
    const message =
      reminder.message_preview ||
      buildDeterministicReminderPreview({
        kind: reminder.kind,
        openLoopSubject: subject,
        dayNumber: input.lifecycleDay,
      });

    const { error: turnError } = await supabase.from("coaching_ai_turns").insert({
      enrollment_id: input.enrollmentId,
      customer_id: input.customerId,
      owner_member_id: input.ownerMemberId,
      log_date: taipeiDateString(now),
      role: "coach",
      channel: "system",
      content: message,
      intention: "follow_up",
      metadata: {
        kind: "go21_reminder",
        reminderId: reminder.id,
        reminderKind: reminder.kind,
      },
    });
    if (turnError) {
      console.error(
        JSON.stringify({
          event: "go21_reminder_turn_insert_failed",
          reminderId: reminder.id,
          error: turnError.message,
        }),
      );
      continue;
    }

    const { error: markError } = await supabase
      .from("coaching_ai_reminders")
      .update({
        status: "delivered",
        delivered_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", reminder.id)
      .eq("enrollment_id", input.enrollmentId)
      .eq("status", "scheduled");
    if (markError) {
      console.error(
        JSON.stringify({
          event: "go21_reminder_mark_delivered_failed",
          reminderId: reminder.id,
          error: markError.message,
        }),
      );
      continue;
    }
    delivered += 1;
  }

  return { delivered, suppressed };
}

async function loadDeliveryGate(input: {
  enrollmentId: string;
  now: Date;
}): Promise<{ deliveredTodayCount: number; lastDeliveredAt: Date | null }> {
  const supabase = createSupabaseServiceClient();
  const today = taipeiDateString(input.now);
  const dayStart = new Date(`${today}T00:00:00+08:00`);
  const { data } = await supabase
    .from("coaching_ai_reminders")
    .select("delivered_at")
    .eq("enrollment_id", input.enrollmentId)
    .eq("status", "delivered")
    .gte("delivered_at", dayStart.toISOString())
    .order("delivered_at", { ascending: false })
    .limit(10);
  const rows = data ?? [];
  return {
    deliveredTodayCount: rows.length,
    lastDeliveredAt: rows[0]?.delivered_at ? new Date(String(rows[0].delivered_at)) : null,
  };
}

async function hasMeasurementNearCheckpoint(input: {
  customerId: string;
  lifecycleAnchorDate: string;
  kind: Go21ReminderKind;
}): Promise<boolean> {
  const dayNumber =
    input.kind === "measurement_day7"
      ? 7
      : input.kind === "measurement_day14"
        ? 14
        : input.kind === "measurement_day21"
          ? 21
          : null;
  if (dayNumber == null) return false;
  const supabase = createSupabaseServiceClient();
  const target = addCalendarDays(input.lifecycleAnchorDate, dayNumber - 1);
  const from = addCalendarDays(target, -1);
  const to = addCalendarDays(target, 1);
  const { data } = await supabase
    .from("body_composition_records")
    .select("id")
    .eq("customer_id", input.customerId)
    .gte("record_date", from)
    .lte("record_date", to)
    .limit(1);
  return Boolean(data && data.length > 0);
}

async function isOpenLoopResolved(openLoopId: string): Promise<boolean> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("coaching_ai_open_loops")
    .select("status")
    .eq("id", openLoopId)
    .maybeSingle();
  if (!data) return false;
  return data.status === "resolved" || data.status === "abandoned" || data.status === "stale";
}

/**
 * Worker batch: claim due reminders across enrollments and deliver in-app.
 * Safe for Hobby daily cron + on-open delivery.
 */
export async function processGo21ReminderDeliveryBatch(input?: {
  limit?: number;
  now?: Date;
}): Promise<{ scanned: number; delivered: number; suppressed: number }> {
  const now = input?.now ?? new Date();
  const limit = Math.max(1, Math.min(50, input?.limit ?? 20));
  const supabase = createSupabaseServiceClient();

  // Skip entire batch during quiet hours (actual enforcement)
  if (isGo21QuietHour(taipeiHour(now))) {
    return { scanned: 0, delivered: 0, suppressed: 0 };
  }

  const { data: due, error } = await supabase
    .from("coaching_ai_reminders")
    .select("enrollment_id, customer_id, owner_member_id")
    .eq("status", "scheduled")
    .lte("due_at", now.toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error(
      JSON.stringify({ event: "go21_reminder_batch_claim_failed", error: error.message }),
    );
    throw new Error(error.message);
  }

  const unique = new Map<
    string,
    { enrollmentId: string; customerId: string; ownerMemberId: string }
  >();
  for (const row of due ?? []) {
    unique.set(String(row.enrollment_id), {
      enrollmentId: String(row.enrollment_id),
      customerId: String(row.customer_id),
      ownerMemberId: String(row.owner_member_id),
    });
  }

  let delivered = 0;
  let suppressed = 0;
  for (const item of unique.values()) {
    const { data: enrollment } = await supabase
      .from("coaching_enrollments")
      .select("status, started_at, go21_started_at, planned_end_at")
      .eq("id", item.enrollmentId)
      .maybeSingle();
    const anchor = String(
      (enrollment && "go21_started_at" in enrollment && enrollment.go21_started_at
        ? enrollment.go21_started_at
        : enrollment?.started_at) ?? taipeiDateString(now),
    ).slice(0, 10);
    const result = await deliverDueGo21RemindersForEnrollment({
      enrollmentId: item.enrollmentId,
      customerId: item.customerId,
      ownerMemberId: item.ownerMemberId,
      lifecycleDay: null,
      lifecycleAnchorDate: anchor,
      cycleStatus: enrollment?.status ?? "active",
      now,
    });
    delivered += result.delivered;
    suppressed += result.suppressed;
  }

  console.info(
    JSON.stringify({
      event: "go21_reminder_batch_complete",
      scanned: unique.size,
      delivered,
      suppressed,
    }),
  );
  return { scanned: unique.size, delivered, suppressed };
}
