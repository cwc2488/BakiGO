import { fivePlusFiveHour, fivePlusFiveToday, getBusinessWeekRange } from "@/lib/five-plus-five/dates";
import { FIVE_PLUS_FIVE_RULES, resolveFivePlusFiveTargets } from "@/lib/five-plus-five/rules";
import { claimNotificationDelivery } from "@/lib/push/notification-deliveries";
import { sendPushToUser } from "@/lib/push/send-push";
import { PUSH_SOURCE } from "@/lib/push/types";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

const LOOKBACK_MS = 45 * 60 * 1000; // catch missed cron ticks within 45m

export type FivePlusFivePushSlot = "20" | "23";

function scheduledAtForSlot(today: string, slot: FivePlusFivePushSlot): string {
  const hour = slot === "20" ? "20" : "23";
  return `${today}T${hour}:00:00+08:00`;
}

function isSlotDue(nowMs: number, today: string, slot: FivePlusFivePushSlot): boolean {
  const fireMs = Date.parse(scheduledAtForSlot(today, slot));
  if (!Number.isFinite(fireMs)) return false;
  return nowMs >= fireMs && nowMs <= fireMs + LOOKBACK_MS;
}

async function loadActivePushMemberIds(): Promise<string[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("member_id")
    .eq("is_active", true);
  if (error) {
    console.error(
      JSON.stringify({ event: "five_plus_five_push_members_failed", error: error.message }),
    );
    return [];
  }
  return Array.from(new Set((data ?? []).map((row) => String(row.member_id))));
}

type TodayReportLite = {
  member_id: string;
  fish_pool_count: number;
  invitation_five_steps_count: number;
};

async function loadTodayReports(memberIds: string[], today: string): Promise<Map<string, TodayReportLite>> {
  const map = new Map<string, TodayReportLite>();
  if (memberIds.length === 0) return map;
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("five_plus_five_reports")
    .select("member_id, fish_pool_count, invitation_five_steps_count")
    .eq("report_date", today)
    .in("member_id", memberIds);
  if (error) {
    // Table may not exist yet pre-migration
    console.error(
      JSON.stringify({ event: "five_plus_five_push_reports_failed", error: error.message }),
    );
    return map;
  }
  for (const row of data ?? []) {
    map.set(String(row.member_id), row as TodayReportLite);
  }
  return map;
}

async function loadWeekInvitationTotals(
  memberIds: string[],
  weekStart: string,
  weekEnd: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (memberIds.length === 0) return map;
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("five_plus_five_reports")
    .select("member_id, invitation_five_steps_count")
    .gte("report_date", weekStart)
    .lte("report_date", weekEnd)
    .in("member_id", memberIds);
  if (error) {
    console.error(
      JSON.stringify({ event: "five_plus_five_push_week_failed", error: error.message }),
    );
    return map;
  }
  for (const row of data ?? []) {
    const id = String(row.member_id);
    map.set(id, (map.get(id) ?? 0) + Number(row.invitation_five_steps_count ?? 0));
  }
  return map;
}

export function shouldNotifyFivePlusFive(input: {
  slot: FivePlusFivePushSlot;
  hasTodayReport: boolean;
  fishPoolCount: number;
  fishDailyTarget: number;
}): boolean {
  if (input.slot === "23") {
    return !input.hasTodayReport;
  }
  // 20:00 — skip only if reported AND fish met
  if (input.hasTodayReport && input.fishPoolCount >= input.fishDailyTarget) {
    return false;
  }
  return true;
}

export function buildFivePlusFivePushCopy(input: {
  slot: FivePlusFivePushSlot;
  fishPoolCount: number;
  fishDailyTarget: number;
  weekInvitation: number;
  invitationWeeklyTarget: number;
}): { title: string; body: string } {
  if (input.slot === "23") {
    return {
      title: "5＋5 行動",
      body: "今天的5＋5還沒回報，記得在 23:59 前完成今日回報。",
    };
  }
  return {
    title: "5＋5 行動",
    body: `今天的5＋5完成了嗎？魚池目前 ${input.fishPoolCount}/${input.fishDailyTarget}，本週邀約5步驟 ${input.weekInvitation}/${input.invitationWeeklyTarget}，記得在 23:59 前完成今天的行動與回報。`,
  };
}

/**
 * Process 20:00 / 23:00 Asia/Taipei reminders.
 * Reuses claimNotificationDelivery dedupe — never double-send same slot+date.
 */
export async function processFivePlusFivePushReminders(input?: {
  nowMs?: number;
  limit?: number;
}): Promise<{
  slot: FivePlusFivePushSlot | null;
  scannedMembers: number;
  due: number;
  sent: number;
  skipped: number;
}> {
  if (!isSupabaseServiceConfigured()) {
    return { slot: null, scannedMembers: 0, due: 0, sent: 0, skipped: 0 };
  }

  const nowMs = input?.nowMs ?? Date.now();
  const now = new Date(nowMs);
  const today = fivePlusFiveToday(now);
  const hour = fivePlusFiveHour(now);
  void hour;
  void FIVE_PLUS_FIVE_RULES;

  let slot: FivePlusFivePushSlot | null = null;
  if (isSlotDue(nowMs, today, "20")) slot = "20";
  else if (isSlotDue(nowMs, today, "23")) slot = "23";

  if (!slot) {
    return { slot: null, scannedMembers: 0, due: 0, sent: 0, skipped: 0 };
  }

  const targets = resolveFivePlusFiveTargets();
  const week = getBusinessWeekRange(today);
  const memberIds = await loadActivePushMemberIds();
  const todayReports = await loadTodayReports(memberIds, today);
  const weekInvites =
    slot === "20"
      ? await loadWeekInvitationTotals(memberIds, week.start, week.end)
      : new Map<string, number>();

  const limit = Math.max(1, Math.min(500, input?.limit ?? 200));
  let due = 0;
  let sent = 0;
  let skipped = 0;
  let processed = 0;

  for (const memberId of memberIds) {
    if (processed >= limit) break;

    const report = todayReports.get(memberId);
    const hasTodayReport = Boolean(report);
    const fish = report?.fish_pool_count ?? 0;
    const weekInvitation = weekInvites.get(memberId) ?? 0;

    if (
      !shouldNotifyFivePlusFive({
        slot,
        hasTodayReport,
        fishPoolCount: fish,
        fishDailyTarget: targets.fishPoolDaily,
      })
    ) {
      continue;
    }

    due += 1;
    processed += 1;

    const copy = buildFivePlusFivePushCopy({
      slot,
      fishPoolCount: fish,
      fishDailyTarget: targets.fishPoolDaily,
      weekInvitation,
      invitationWeeklyTarget: targets.invitationFiveStepsWeekly,
    });

    const sourceKey = `five_plus_five:${slot}:${today}`;
    const scheduledAt = scheduledAtForSlot(today, slot);

    const claimed = await claimNotificationDelivery({
      memberId,
      sourceType: PUSH_SOURCE.fivePlusFiveReminder,
      sourceKey,
      scheduledAt,
      title: copy.title,
      body: copy.body,
      targetUrl: "/5plus5",
    });

    if (!claimed) {
      skipped += 1;
      continue;
    }

    const result = await sendPushToUser({
      memberId,
      title: copy.title,
      body: copy.body,
      url: "/5plus5",
      tag: sourceKey,
    });

    if (result.succeeded > 0) sent += 1;
    else skipped += 1;
  }

  return { slot, scannedMembers: memberIds.length, due, sent, skipped };
}
