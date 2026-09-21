import { fivePlusFiveToday, getBusinessWeekRange } from "@/lib/five-plus-five/dates";
import { processDueMembersWithQuota } from "@/lib/five-plus-five/push-batch";
import { resolveFivePlusFiveTargets } from "@/lib/five-plus-five/rules";
import {
  collectActivePushMemberIds,
  PUSH_SUBSCRIPTION_PAGE_SIZE,
} from "@/lib/push/active-push-members";
import { claimNotificationDelivery } from "@/lib/push/notification-deliveries";
import {
  DEFAULT_FIVE_PLUS_FIVE_PUSH_LIMIT,
  MAX_FIVE_PLUS_FIVE_PUSH_LIMIT,
} from "@/lib/push/push-worker-limits";
import { sendPushToUser } from "@/lib/push/send-push";
import { PUSH_SOURCE } from "@/lib/push/types";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

const LOOKBACK_MS = 45 * 60 * 1000; // catch missed cron ticks within 45m
/** Cron GET default — must cover 1000 active members in one slot window. */
export const FIVE_PLUS_FIVE_DEFAULT_CLAIM_LIMIT = DEFAULT_FIVE_PLUS_FIVE_PUSH_LIMIT;
export const FIVE_PLUS_FIVE_MAX_CLAIM_LIMIT = MAX_FIVE_PLUS_FIVE_PUSH_LIMIT;
/** Bounded concurrency — never unlimited Promise.all. */
export const FIVE_PLUS_FIVE_SEND_CONCURRENCY = 25;

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

/** Paginated active push member discovery (deduped). Exported for tests. */
export async function loadActivePushMemberIds(): Promise<string[]> {
  if (!isSupabaseServiceConfigured()) {
    return [];
  }
  const supabase = createSupabaseServiceClient();

  return collectActivePushMemberIds({
    pageSize: PUSH_SUBSCRIPTION_PAGE_SIZE,
    fetchPage: async (from, to) => {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("member_id")
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) {
        console.error(
          JSON.stringify({
            event: "five_plus_five_push_members_failed",
            error: error.message,
            from,
            to,
          }),
        );
        return [];
      }
      return (data ?? []) as Array<{ member_id: string }>;
    },
  });
}

type TodayReportLite = {
  member_id: string;
  fish_pool_count: number;
  invitation_five_steps_count: number;
  has_user_submitted?: boolean | null;
};

async function loadTodayReports(
  memberIds: string[],
  today: string,
): Promise<Map<string, TodayReportLite>> {
  const map = new Map<string, TodayReportLite>();
  if (memberIds.length === 0) return map;
  const supabase = createSupabaseServiceClient();

  // Chunk IN queries for large orgs (1000+)
  const chunkSize = 200;
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("five_plus_five_reports")
      .select("member_id, fish_pool_count, invitation_five_steps_count, has_user_submitted")
      .eq("report_date", today)
      .in("member_id", chunk);
    if (error) {
      console.error(
        JSON.stringify({ event: "five_plus_five_push_reports_failed", error: error.message }),
      );
      return map;
    }
    for (const row of data ?? []) {
      map.set(String(row.member_id), row as TodayReportLite);
    }
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
  const chunkSize = 200;
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("five_plus_five_reports")
      .select("member_id, invitation_five_steps_count")
      .gte("report_date", weekStart)
      .lte("report_date", weekEnd)
      .in("member_id", chunk);
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

export function collectDueFivePlusFiveMemberIds(input: {
  memberIds: readonly string[];
  slot: FivePlusFivePushSlot;
  todayReports: Map<string, TodayReportLite>;
  fishDailyTarget: number;
}): string[] {
  const due: string[] = [];
  for (const memberId of input.memberIds) {
    const report = input.todayReports.get(memberId);
    const hasUserSubmitted =
      report == null ? false : report.has_user_submitted == null ? true : Boolean(report.has_user_submitted);
    if (
      shouldNotifyFivePlusFive({
        slot: input.slot,
        hasTodayReport: hasUserSubmitted,
        fishPoolCount: report?.fish_pool_count ?? 0,
        fishDailyTarget: input.fishDailyTarget,
      })
    ) {
      due.push(memberId);
    }
  }
  return due;
}

/**
 * Process 20:00 / 23:00 Asia/Taipei reminders.
 * Already-claimed members do not consume claim quota — second cron advances.
 */
export async function processFivePlusFivePushReminders(input?: {
  nowMs?: number;
  limit?: number;
  concurrency?: number;
}): Promise<{
  slot: FivePlusFivePushSlot | null;
  scannedMembers: number;
  due: number;
  sent: number;
  skipped: number;
  newlyClaimed: number;
  alreadyClaimed: number;
}> {
  if (!isSupabaseServiceConfigured()) {
    return {
      slot: null,
      scannedMembers: 0,
      due: 0,
      sent: 0,
      skipped: 0,
      newlyClaimed: 0,
      alreadyClaimed: 0,
    };
  }

  const nowMs = input?.nowMs ?? Date.now();
  const now = new Date(nowMs);
  const today = fivePlusFiveToday(now);

  let slot: FivePlusFivePushSlot | null = null;
  if (isSlotDue(nowMs, today, "20")) slot = "20";
  else if (isSlotDue(nowMs, today, "23")) slot = "23";

  if (!slot) {
    return {
      slot: null,
      scannedMembers: 0,
      due: 0,
      sent: 0,
      skipped: 0,
      newlyClaimed: 0,
      alreadyClaimed: 0,
    };
  }

  const targets = resolveFivePlusFiveTargets();
  const week = getBusinessWeekRange(today);
  const memberIds = await loadActivePushMemberIds();
  const todayReports = await loadTodayReports(memberIds, today);
  const weekInvites =
    slot === "20"
      ? await loadWeekInvitationTotals(memberIds, week.start, week.end)
      : new Map<string, number>();

  const dueMemberIds = collectDueFivePlusFiveMemberIds({
    memberIds,
    slot,
    todayReports,
    fishDailyTarget: targets.fishPoolDaily,
  });

  const limit = Math.max(
    1,
    Math.min(
      FIVE_PLUS_FIVE_MAX_CLAIM_LIMIT,
      Math.floor(input?.limit ?? FIVE_PLUS_FIVE_DEFAULT_CLAIM_LIMIT),
    ),
  );
  const sourceKey = `five_plus_five:${slot}:${today}`;
  const scheduledAt = scheduledAtForSlot(today, slot);

  const batch = await processDueMembersWithQuota({
    dueMemberIds,
    limit,
    concurrency: input?.concurrency ?? FIVE_PLUS_FIVE_SEND_CONCURRENCY,
    tryClaimAndSend: async (memberId) => {
      const report = todayReports.get(memberId);
      const fish = report?.fish_pool_count ?? 0;
      const weekInvitation = weekInvites.get(memberId) ?? 0;
      const copy = buildFivePlusFivePushCopy({
        slot: slot!,
        fishPoolCount: fish,
        fishDailyTarget: targets.fishPoolDaily,
        weekInvitation,
        invitationWeeklyTarget: targets.invitationFiveStepsWeekly,
      });

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
        return "already_claimed";
      }

      const result = await sendPushToUser({
        memberId,
        title: copy.title,
        body: copy.body,
        url: "/5plus5",
        tag: sourceKey,
      });

      return result.succeeded > 0 ? "sent" : "send_failed";
    },
  });

  return {
    slot,
    scannedMembers: memberIds.length,
    due: dueMemberIds.length,
    sent: batch.sent,
    skipped: batch.alreadyClaimed + batch.sendFailed,
    newlyClaimed: batch.newlyClaimed,
    alreadyClaimed: batch.alreadyClaimed,
  };
}
