import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import type { PushSourceType } from "@/lib/push/types";

/**
 * Atomically claim a delivery slot. Returns true if this caller should send.
 * Unique constraint prevents duplicate sends across concurrent cron workers.
 */
export async function claimNotificationDelivery(input: {
  memberId: string;
  sourceType: PushSourceType;
  sourceKey: string;
  scheduledAt: string;
  title: string;
  body: string;
  targetUrl?: string;
}): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) {
    return false;
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("notification_deliveries").insert({
    member_id: input.memberId,
    channel: "web_push",
    source_type: input.sourceType,
    source_key: input.sourceKey,
    scheduled_at: input.scheduledAt,
    title: input.title,
    body: input.body,
    target_url: input.targetUrl ?? null,
    status: "delivered",
  });

  if (error) {
    // Unique violation → already delivered / claimed
    if (error.code === "23505") {
      return false;
    }
    console.error(
      JSON.stringify({
        event: "notification_delivery_claim_failed",
        memberId: input.memberId,
        sourceType: input.sourceType,
        sourceKey: input.sourceKey,
        error: error.message,
      }),
    );
    return false;
  }

  return true;
}
