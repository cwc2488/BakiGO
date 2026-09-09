import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(512).optional(),
  deviceLabel: z.string().max(120).optional(),
});

const deleteSchema = z.object({
  endpoint: z.string().url().max(2048),
});

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    return null;
  }
  return createSupabaseServiceClient();
}

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, is_active, updated_at, last_success_at, device_label")
    .eq("member_id", memberId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    subscribed: (data ?? []).length > 0,
    count: (data ?? []).length,
    subscriptions: data ?? [],
  });
}

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Upsert by unique endpoint; reclaim device if it previously belonged to another member.
  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        member_id: memberId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        user_agent: parsed.data.userAgent ?? null,
        device_label: parsed.data.deviceLabel ?? null,
        updated_at: now,
        is_active: true,
        failure_count: 0,
      },
      { onConflict: "endpoint" },
    )
    .select("id, endpoint, is_active, updated_at")
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        event: "push_subscription_upsert_failed",
        memberId,
        error: error.message,
      }),
    );
    return NextResponse.json({ error: "無法儲存推播訂閱" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, subscription: data });
}

export async function DELETE(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("member_id", memberId)
    .eq("endpoint", parsed.data.endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
