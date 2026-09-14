import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import type { MemoReminderType, MemoWeekday } from "@/lib/memos/types";
import { advanceNextReminderAfterNotify } from "@/lib/memos/reminder-schedule";
import { claimNotificationDelivery } from "@/lib/push/notification-deliveries";
import { sendPushToUser } from "@/lib/push/send-push";
import { PUSH_SOURCE } from "@/lib/push/types";

type DueMemoRow = {
  id: string;
  member_id: string;
  title: string;
  reminder_type: string;
  reminder_time: string | null;
  reminder_weekday: number | null;
  reminder_date: string | null;
  next_reminder_at: string;
};

export type MemoPushProcessResult = {
  due: number;
  sent: number;
  skipped: number;
};

function isReminderType(value: string): value is MemoReminderType {
  return value === "NONE" || value === "DAILY" || value === "WEEKLY" || value === "SPECIFIC_DATE";
}

/**
 * Process due memo reminders via existing Web Push + delivery claim.
 * Does not auto-complete memos; advances or clears next_reminder_at after claim.
 */
export async function processMemoPushReminders(input?: {
  limit?: number;
  now?: Date;
}): Promise<MemoPushProcessResult> {
  if (!isSupabaseServiceConfigured()) {
    return { due: 0, sent: 0, skipped: 0 };
  }

  const limit = Math.max(1, Math.min(200, input?.limit ?? 80));
  const now = input?.now ?? new Date();
  const nowIso = now.toISOString();
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("memos")
    .select(
      "id, member_id, title, reminder_type, reminder_time, reminder_weekday, reminder_date, next_reminder_at",
    )
    .eq("completed", false)
    .not("next_reminder_at", "is", null)
    .lte("next_reminder_at", nowIso)
    .order("next_reminder_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as DueMemoRow[];
  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!isReminderType(row.reminder_type) || row.reminder_type === "NONE") {
      skipped += 1;
      continue;
    }

    const scheduledAt = row.next_reminder_at;
    const sourceKey = `${row.id}:${scheduledAt}`;
    const title = "備忘錄提醒";
    const body = row.title;
    const url = `/memos?id=${encodeURIComponent(row.id)}`;

    const { count } = await supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("member_id", row.member_id)
      .eq("is_active", true);

    if (!count || count < 1) {
      skipped += 1;
      continue;
    }

    const claimed = await claimNotificationDelivery({
      memberId: row.member_id,
      sourceType: PUSH_SOURCE.memoReminder,
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
      memberId: row.member_id,
      title,
      body,
      url,
      tag: `memo:${row.id}`,
    });

    const nextReminderAt = advanceNextReminderAfterNotify(
      row.reminder_type,
      row.reminder_time,
      (row.reminder_weekday as MemoWeekday | null) ?? null,
      row.reminder_date,
      scheduledAt,
    );

    const { error: updateError } = await supabase
      .from("memos")
      .update({
        last_notified_at: nowIso,
        next_reminder_at: nextReminderAt,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("member_id", row.member_id);

    if (updateError) {
      skipped += 1;
      continue;
    }

    if (result.succeeded > 0) {
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return { due: rows.length, sent, skipped };
}
