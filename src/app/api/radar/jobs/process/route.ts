import {
  nextRadarDrainAction,
  noStoreJson,
  parseRadarProcessMode,
  runWorkerUntilBudget,
  scheduleRadarFinalize,
  scheduleRadarProcessContinuation,
} from "@/lib/radar/jobs/auto-drain";
import { loadRadarOpsStatus } from "@/lib/radar/jobs/ops-status";
import { createSupabaseRadarJobQueue } from "@/lib/radar/jobs/supabase-queue-store";
import { runWorkerBatch, type WorkerContext } from "@/lib/radar/jobs/workers/dispatch";
import { createSourceAdapterRegistry } from "@/lib/radar/sources/registry";
import { SupabasePipelineStore } from "@/lib/radar/pipeline/supabase-pipeline-store";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import {
  createSupabaseServiceClient,
  isRadarCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProcessBody = {
  limit?: number;
  continue?: boolean;
  pipeline_run_id?: string;
};

function createWorkerContext(): WorkerContext {
  const client = createSupabaseServiceClient();
  const repo = new SupabaseRadarRepository(client);
  return {
    repo,
    queue: createSupabaseRadarJobQueue(client),
    sources: createSourceAdapterRegistry({
      record: (entry) => repo.recordSourceFetchAudit(entry),
    }),
    pipelineStore: new SupabasePipelineStore(client),
  };
}

async function handleProcess(request: Request) {
  if (!isRadarCronAuthorized(request)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return noStoreJson({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  let body: ProcessBody = {};
  try {
    if (request.method === "POST" && request.headers.get("content-type")?.includes("application/json")) {
      body = (await request.json()) as ProcessBody;
    }
  } catch {
    return noStoreJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = parseRadarProcessMode({ method: request.method, body });

  try {
    const client = createSupabaseServiceClient();
    const opsBefore = await loadRadarOpsStatus(client);
    const pipeline_run_id = mode.pipeline_run_id ?? opsBefore.run?.pipeline_run_id ?? null;
    if (pipeline_run_id) {
      // Yesterday's leftover score jobs otherwise starve today's run
      // (claim is global: priority DESC, scheduled_at ASC).
      await client
        .from("radar_jobs")
        .update({ priority: 50_000 })
        .eq("pipeline_run_id", pipeline_run_id)
        .in("status", ["pending", "failed"])
        .lt("priority", 50_000);
    }

    if (mode.continueDrain) {
      // Cron GET must do bounded work in-request. after() is only the next hop;
      // Production proved a 202+after() cron can return with zero jobs processed.
      let processed = 0;
      try {
        processed = await runWorkerUntilBudget(createWorkerContext(), mode.budgetMs);
      } catch (error) {
        console.error(
          JSON.stringify({
            type: "radar_auto_continue_work_failed",
            error_class: error instanceof Error ? error.name : "unknown",
          }),
        );
        processed = 1;
      }
      const action = nextRadarDrainAction({
        processed,
        pipeline_run_id,
      });
      console.info(
        JSON.stringify({
          type: "radar_auto_continue_work",
          processed,
          next: action.kind,
        }),
      );
      // Schedule the hop before the slow ops read so a 300s kill cannot
      // drop continuation after work already succeeded.
      if (action.kind === "continue") {
        scheduleRadarProcessContinuation({ pipeline_run_id: action.pipeline_run_id });
      } else {
        scheduleRadarFinalize({ pipeline_run_id: action.pipeline_run_id });
      }
      let ops = null;
      try {
        ops = await loadRadarOpsStatus(createSupabaseServiceClient());
        if (
          ops.run &&
          ops.run.status === "running" &&
          ops.run.jobs.pending === 0 &&
          ops.run.jobs.running === 0
        ) {
          // Claim is global. Yesterday leftovers can keep processed>0 and
          // skip today's finalize unless we close the current run here.
          scheduleRadarFinalize({ pipeline_run_id: ops.run.pipeline_run_id });
        }
        console.info(
          JSON.stringify({
            type: "radar_ops_status",
            current_run_date: ops.current_run_date,
            run: ops.run
              ? {
                  pipeline_run_id: ops.run.pipeline_run_id,
                  status: ops.run.status,
                  jobs: ops.run.jobs,
                  rank_status: ops.run.rank_status,
                  recommendation_count: ops.run.recommendation_count,
                  last_progress_at: ops.run.last_progress_at,
                  oldest_running: ops.run.oldest_running,
                }
              : null,
            other_open_runs: ops.other_open_runs.map((run) => ({
              pipeline_run_id: run.pipeline_run_id,
              run_date: run.run_date,
              status: run.status,
              jobs: run.jobs,
              rank_status: run.rank_status,
              last_progress_at: run.last_progress_at,
            })),
          }),
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            type: "radar_ops_status_failed",
            error_class: error instanceof Error ? error.name : "unknown",
          }),
        );
      }
      return noStoreJson({ ok: true, accepted: true, continue: true, processed, ops }, { status: 202 });
    }

    const processed = await runWorkerBatch(createWorkerContext(), mode.claimLimit);
    return noStoreJson({
      ok: true,
      processed,
      continue: false,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Worker batch failed";
    return noStoreJson({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleProcess(request);
}

/** Vercel Cron invokes GET. Always continue-drain mode. */
export async function GET(request: Request) {
  return handleProcess(request);
}
