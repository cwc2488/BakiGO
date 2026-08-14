import { NextResponse } from "next/server";
import { runCoachingGenerationWorkerBatch } from "@/lib/coaching/ai/run-coaching-generation-worker";
import {
  createSupabaseServiceClient,
  isCoachingCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handleWorkerRequest(request: Request) {
  const started = Date.now();
  if (!isCoachingCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  // Touch service client early so misconfig fails before claim.
  createSupabaseServiceClient();

  let limit = 10;
  let concurrency: number | undefined;

  if (request.method === "POST") {
    try {
      if (request.headers.get("content-type")?.includes("application/json")) {
        const body = (await request.json()) as { limit?: number; concurrency?: number };
        if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
          limit = Math.max(1, Math.min(25, Math.floor(body.limit)));
        }
        if (typeof body.concurrency === "number" && Number.isFinite(body.concurrency)) {
          concurrency = Math.max(1, Math.min(5, Math.floor(body.concurrency)));
        }
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  } else {
    // Vercel Cron invokes GET — default limit 10; optional query override.
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    if (limitParam) {
      const parsed = Number(limitParam);
      if (Number.isFinite(parsed)) {
        limit = Math.max(1, Math.min(25, Math.floor(parsed)));
      }
    }
  }

  try {
    const result = await runCoachingGenerationWorkerBatch({ limit, concurrency });
    const payload = {
      ok: true as const,
      claimed: result.claimed,
      completed: result.completed,
      failed: result.failed,
      skipped: result.skipped,
      superseded: result.superseded,
      retryScheduled: result.retryScheduled,
      reclaimed: result.reclaimed,
      recovered: result.recovered,
      claimableQueued: result.claimableQueued,
      processingCount: result.processingCount,
      jobIds: result.jobIds,
      durationMs: result.durationMs,
      duration: result.durationMs,
      results: result.results,
      /** Explicit: HTTP 200 ≠ successful drain when queue had work. */
      drainNote:
        result.claimed === 0 && result.claimableQueued > 0
          ? "claimed_0_with_claimable_queued"
          : result.claimed === 0
            ? "claimed_0"
            : "claimed_gt_0",
    };
    console.info(
      JSON.stringify({
        type: "coaching_jobs_process_result",
        method: request.method,
        claimed: payload.claimed,
        completed: payload.completed,
        failed: payload.failed,
        skipped: payload.skipped,
        superseded: payload.superseded,
        recovered: payload.recovered,
        claimableQueued: payload.claimableQueued,
        processingCount: payload.processingCount,
        drainNote: payload.drainNote,
        jobIds: payload.jobIds,
        duration: payload.durationMs,
        request_duration_ms: Date.now() - started,
      }),
    );
    return NextResponse.json(payload);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Coaching worker batch failed";
    console.error(
      JSON.stringify({
        type: "coaching_jobs_process_error",
        message,
        duration: Date.now() - started,
      }),
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Manual / external schedulers may POST with JSON body `{ "limit": 10 }`. */
export async function POST(request: Request) {
  return handleWorkerRequest(request);
}

/** Vercel Cron invokes GET; defaults to limit 10. */
export async function GET(request: Request) {
  return handleWorkerRequest(request);
}
