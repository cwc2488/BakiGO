import { noStoreJson, scheduleRadarProcessContinuation } from "@/lib/radar/jobs/auto-drain";
import { createSupabaseRadarJobQueue } from "@/lib/radar/jobs/supabase-queue-store";
import { runDailyPipelineOrchestrator } from "@/lib/radar/pipeline/orchestrator";
import { resolveDailyPipelineRunDate } from "@/lib/radar/pipeline/run-date";
import { SupabasePipelineStore } from "@/lib/radar/pipeline/supabase-pipeline-store";
import {
  createSupabaseServiceClient,
  isRadarCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DailyPipelineRequestBody = {
  run_date?: string;
  timezone?: string;
  trace_id?: string;
};

async function handleDailyPipeline(request: Request) {
  if (!isRadarCronAuthorized(request)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseServiceConfigured()) {
    return noStoreJson(
      { error: "Supabase service role is not configured" },
      { status: 503 },
    );
  }

  let body: DailyPipelineRequestBody = {};
  try {
    if (request.method === "POST" && request.headers.get("content-type")?.includes("application/json")) {
      body = (await request.json()) as DailyPipelineRequestBody;
    }
  } catch {
    return noStoreJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  const timezone = body.timezone ?? "Asia/Taipei";
  const run_date = resolveDailyPipelineRunDate({
    run_date: body.run_date,
    timezone,
  });

  try {
    const client = createSupabaseServiceClient();
    const result = await runDailyPipelineOrchestrator(
      {
        store: new SupabasePipelineStore(client),
        queue: createSupabaseRadarJobQueue(client),
      },
      {
        run_date,
        timezone,
        triggered_by: "cron",
        trace_id: body.trace_id,
      },
    );

    scheduleRadarProcessContinuation({ pipeline_run_id: result.pipeline_run_id });

    return noStoreJson(
      {
        ok: true,
        run_date: result.run_date,
        pipeline_run_id: result.pipeline_run_id,
        rerun: result.rerun,
        enqueued: {
          discovery_jobs: result.discovery_jobs_enqueued,
          refresh_candidates: result.refresh_candidates_selected,
          enrich_jobs: result.enrich_jobs_enqueued,
          normalize_jobs: result.normalize_jobs_enqueued,
          skipped_duplicates: result.skipped_duplicate_jobs,
        },
      },
      { status: result.rerun ? 200 : 202 },
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Daily pipeline orchestration failed";
    return noStoreJson({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleDailyPipeline(request);
}

/** Vercel Cron invokes GET. Same-day orchestrate is idempotent; always kicks the worker. */
export async function GET(request: Request) {
  return handleDailyPipeline(request);
}
