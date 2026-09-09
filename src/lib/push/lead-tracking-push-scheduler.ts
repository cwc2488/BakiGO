import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { claimNotificationDelivery } from "@/lib/push/notification-deliveries";
import { sendPushToUser } from "@/lib/push/send-push";
import { PUSH_SOURCE } from "@/lib/push/types";
import { summarizeStatus } from "@/lib/lead-tracking/list-utils";

type DueLeadRow = {
  id: string;
  owner_member_id: string;
  name: string;
  current_status: string | null;
  next_follow_up_at: string;
};

export async function processLeadTrackingPushReminders(input?: {
  limit?: number;
  now?: Date;
}): Promise<{ due: number; sent: number; skipped: number }> {
  if (!isSupabaseServiceConfigured()) {
    return { due: 0, sent: 0, skipped: 0 };
  }

  const limit = Math.max(1, Math.min(200, input?.limit ?? 80));
  const now = input?.now ?? new Date();
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("lead_tracking")
    .select("id, owner_member_id, name, current_status, next_follow_up_at")
    .eq("reminder_enabled", true)
    .not("next_follow_up_at", "is", null)
    .lte("next_follow_up_at", now.toISOString())
    .order("next_follow_up_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as DueLeadRow[];
  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const scheduledAt = row.next_follow_up_at;
    const sourceKey = `${row.id}:${scheduledAt}`;
    const title = "Baki Go 名單提醒";
    const statusSummary = summarizeStatus(row.current_status, 40);
    const body = statusSummary
      ? `今天要追蹤「${row.name}」 · ${statusSummary}`
      : `今天要追蹤「${row.name}」`;
    const url = `/lead-tracking/${row.id}`;

    // Only members with an active subscription should consume a delivery claim.
    const { count } = await supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("member_id", row.owner_member_id)
      .eq("is_active", true);

    if (!count || count < 1) {
      skipped += 1;
      continue;
    }

    const claimed = await claimNotificationDelivery({
      memberId: row.owner_member_id,
      sourceType: PUSH_SOURCE.leadFollowUp,
      sourceKey,
      scheduledAt,
      title,
      body,
      targetUrl: url,
    });

    if (!claimed) {
      skipped += 1;
      continue;
    }

    const result = await sendPushToUser({
      memberId: row.owner_member_id,
      title,
      body,
      url,
      tag: `lead:${row.id}`,
    });

    if (result.succeeded > 0) {
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return { due: rows.length, sent, skipped };
}
