import { NextResponse } from "next/server";
import {
  createSupabaseServiceClient,
  isCoachingCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { processGo21ReminderDeliveryBatch } from "@/lib/go21/reminders";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Deliver due Baki Go 21 reminders into in-app coach turns.
 * Auth: COACHING_CRON_SECRET / CRON_SECRET (same as coaching jobs worker).
 * Vercel Hobby: daily cron wake; on-open delivery also runs in Go21 context.
 */
async function handle(request: Request) {
  if (!isCoachingCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  createSupabaseServiceClient();

  let limit = 20;
  if (request.method === "POST") {
    try {
      if (request.headers.get("content-type")?.includes("application/json")) {
        const body = (await request.json()) as { limit?: number };
        if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
          limit = Math.max(1, Math.min(50, Math.floor(body.limit)));
        }
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  try {
    const result = await processGo21ReminderDeliveryBatch({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "go21_reminder_worker_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json(
      { error: "Reminder delivery failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
