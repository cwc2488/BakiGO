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
    return NextResponse.json({ ok: true, ...result });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Coaching worker batch failed";
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
