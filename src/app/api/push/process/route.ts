import { NextResponse } from "next/server";
import {
  createSupabaseServiceClient,
  isCoachingCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { processCalendarPushReminders } from "@/lib/push/calendar-push-scheduler";
import { processLeadTrackingPushReminders } from "@/lib/push/lead-tracking-push-scheduler";
import { isVapidConfigured } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Server-side Web Push worker for calendar reminders + lead tracking follow-ups.
 * Auth: COACHING_CRON_SECRET / CRON_SECRET / RADAR_CRON_SECRET (same as coaching jobs).
 */
async function handle(request: Request) {
  if (!isCoachingCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  createSupabaseServiceClient();

  if (!isVapidConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "vapid_unconfigured",
    });
  }

  let limit = 80;
  if (request.method === "POST") {
    try {
      if (request.headers.get("content-type")?.includes("application/json")) {
        const body = (await request.json()) as { limit?: number };
        if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
          limit = Math.max(1, Math.min(200, Math.floor(body.limit)));
        }
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  try {
    const [calendar, leads] = await Promise.all([
      processCalendarPushReminders({ limit }),
      processLeadTrackingPushReminders({ limit }),
    ]);

    console.info(
      JSON.stringify({
        event: "web_push_worker_complete",
        calendar,
        leads,
      }),
    );

    return NextResponse.json({ ok: true, calendar, leads });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "web_push_worker_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json({ error: "Push processing failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
