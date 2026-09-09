import webpush from "web-push";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { sanitizeNotificationUrl } from "@/lib/push/safe-notification-url";
import {
  isVapidConfigured,
  readVapidPrivateKey,
  readVapidPublicKey,
  readVapidSubject,
} from "@/lib/push/vapid";
import type { SendPushResult, WebPushPayload } from "@/lib/push/types";

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
};

let vapidConfigured = false;

function ensureVapid(): void {
  if (vapidConfigured) {
    return;
  }
  if (!isVapidConfigured()) {
    throw new Error("VAPID keys are not configured");
  }
  webpush.setVapidDetails(readVapidSubject(), readVapidPublicKey(), readVapidPrivateKey());
  vapidConfigured = true;
}

async function markSubscriptionSuccess(id: string): Promise<void> {
  if (!isSupabaseServiceConfigured()) {
    return;
  }
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("push_subscriptions")
    .update({
      last_success_at: new Date().toISOString(),
      failure_count: 0,
      updated_at: new Date().toISOString(),
      is_active: true,
    })
    .eq("id", id);
}

async function markSubscriptionFailure(
  id: string,
  failureCount: number,
  deactivate: boolean,
): Promise<void> {
  if (!isSupabaseServiceConfigured()) {
    return;
  }
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("push_subscriptions")
    .update({
      last_failure_at: new Date().toISOString(),
      failure_count: failureCount + 1,
      updated_at: new Date().toISOString(),
      is_active: deactivate ? false : true,
    })
    .eq("id", id);
}

function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Send a Web Push notification to all active subscriptions for a member.
 * Per-endpoint failures never abort the batch.
 */
export async function sendPushToUser(input: {
  memberId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<SendPushResult> {
  const result: SendPushResult = {
    memberId: input.memberId,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    deactivated: 0,
  };

  if (!isSupabaseServiceConfigured()) {
    console.error(JSON.stringify({ event: "web_push_skip", reason: "supabase_unconfigured" }));
    return result;
  }

  if (!isVapidConfigured()) {
    console.error(JSON.stringify({ event: "web_push_skip", reason: "vapid_unconfigured" }));
    return result;
  }

  ensureVapid();

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .eq("member_id", input.memberId)
    .eq("is_active", true);

  if (error) {
    console.error(
      JSON.stringify({
        event: "web_push_load_subscriptions_failed",
        memberId: input.memberId,
        error: error.message,
      }),
    );
    return result;
  }

  const rows = (data ?? []) as SubscriptionRow[];
  result.attempted = rows.length;

  const payload: WebPushPayload = {
    title: input.title,
    body: input.body,
    url: sanitizeNotificationUrl(input.url, "/"),
    tag: input.tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  };

  const bodyJson = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          bodyJson,
          {
            TTL: 60 * 60 * 12,
            urgency: "normal",
          },
        );
        result.succeeded += 1;
        await markSubscriptionSuccess(row.id);
      } catch (err) {
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : undefined;
        const gone = isGoneStatus(statusCode);
        result.failed += 1;
        if (gone) {
          result.deactivated += 1;
        }
        await markSubscriptionFailure(row.id, row.failure_count, gone);
        console.error(
          JSON.stringify({
            event: "web_push_endpoint_failed",
            memberId: input.memberId,
            subscriptionId: row.id,
            statusCode: statusCode ?? null,
            deactivated: gone,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }),
  );

  console.info(
    JSON.stringify({
      event: "web_push_batch_complete",
      memberId: input.memberId,
      attempted: result.attempted,
      succeeded: result.succeeded,
      failed: result.failed,
      deactivated: result.deactivated,
    }),
  );

  return result;
}
