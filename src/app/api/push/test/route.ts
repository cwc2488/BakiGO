import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isVapidConfigured } from "@/lib/push/vapid";
import { sendPushToUser } from "@/lib/push/send-push";
import { claimNotificationDelivery } from "@/lib/push/notification-deliveries";
import { PUSH_SOURCE } from "@/lib/push/types";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isVapidConfigured()) {
    return NextResponse.json({ error: "推播金鑰尚未設定" }, { status: 503 });
  }

  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "服務尚未就緒" }, { status: 503 });
  }

  const supabase = createSupabaseServiceClient();
  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: "無法讀取訂閱狀態" }, { status: 500 });
  }

  if (!count || count < 1) {
    return NextResponse.json({ error: "尚未訂閱推播通知" }, { status: 400 });
  }

  const title = "Baki Go 測試通知";
  const body = "推播通知已正常啟用";
  const url = "/profile#notifications";
  const scheduledAt = new Date().toISOString();
  const sourceKey = `test:${scheduledAt}`;

  const claimed = await claimNotificationDelivery({
    memberId,
    sourceType: PUSH_SOURCE.test,
    sourceKey,
    scheduledAt,
    title,
    body,
    targetUrl: url,
  });

  if (!claimed) {
    return NextResponse.json({ error: "請稍後再試" }, { status: 429 });
  }

  const result = await sendPushToUser({
    memberId,
    title,
    body,
    url,
    tag: "baki-go-test",
  });

  if (result.succeeded < 1) {
    return NextResponse.json(
      { error: "推播發送失敗，請重新開啟推播後再試", result },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, result });
}
