import { NextResponse } from "next/server";
import {
  createSupabaseServiceClient,
  isCoachingCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { processCalendarPushReminders } from "@/lib/push/calendar-push-scheduler";
import { processFivePlusFivePushReminders } from "@/lib/five-plus-five/push-scheduler";
import { resolvePushWorkerLimits } from "@/lib/push/push-worker-limits";
import { isVapidConfigured } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Server-side Web Push worker for calendar + 5＋5 reminders.
 * Auth: COACHING_CRON_SECRET / CRON_SECRET (same as coaching jobs).
 *
 * Vercel cron uses GET (no body):
 *   calendar limit = 80
 *   fivePlusFive limit = 1000
 * POST may pass { limit } independently capped per processor.
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

  let bodyLimit: number | undefined;
  if (request.method === "POST") {
    try {
      if (request.headers.get("content-type")?.includes("application/json")) {
        const body = (await request.json()) as { limit?: number };
        if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
          bodyLimit = body.limit;
        }
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const { calendarLimit, fivePlusFiveLimit } = resolvePushWorkerLimits({
    method: request.method,
    bodyLimit,
  });

  try {
    const calendar = await processCalendarPushReminders({ limit: calendarLimit });
    const fivePlusFive = await processFivePlusFivePushReminders({
      limit: fivePlusFiveLimit,
    });

    console.info(
      JSON.stringify({
        event: "web_push_worker_complete",
        calendarLimit,
        fivePlusFiveLimit,
        calendar,
        fivePlusFive,
      }),
    );

    return NextResponse.json({
      ok: true,
      calendarLimit,
      fivePlusFiveLimit,
      calendar,
      fivePlusFive,
    });
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
