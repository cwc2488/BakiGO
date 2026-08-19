import { NextResponse } from "next/server";
import { drainAnalysisGenerationQueueWithRetry } from "@/lib/analysis/kick-analysis-generation-worker";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

/** Backup worker endpoint (Preview/cron). */
export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const secret = process.env.ANALYSIS_JOBS_SECRET || process.env.COACHING_JOBS_SECRET || "";
  const header = request.headers.get("x-analysis-jobs-secret") || request.headers.get("authorization");
  if (secret && header !== secret && header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await drainAnalysisGenerationQueueWithRetry({ source: "api_jobs_process", limit: 3 });
  return NextResponse.json({ ok: true });
}
