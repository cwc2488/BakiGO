import { noStoreJson } from "@/lib/radar/jobs/auto-drain";
import { runOneTimeRecovery0901 } from "@/lib/radar/jobs/one-time-recovery-0901";
import { ONE_TIME_RECOVERY_0901 } from "@/lib/radar/jobs/one-time-recovery-0901-constants";
import { createSupabaseRadarJobQueue } from "@/lib/radar/jobs/supabase-queue-store";
import { SupabasePipelineStore } from "@/lib/radar/pipeline/supabase-pipeline-store";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { createSourceAdapterRegistry } from "@/lib/radar/sources/registry";
import {
  isOneTimeRecovery0901Authorized,
  isOneTimeRecovery0901Configured,
} from "@/lib/supabase/one-time-recovery-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
  readSupabaseServiceEnv,
} from "@/lib/supabase/service-client";
import type { WorkerContext } from "@/lib/radar/jobs/workers/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ONE-TIME historical recovery for 2026-09-01 empty Top20 snapshots.
 * Hardcoded scope — no arbitrary dates, pipeline runs, members, or operations.
 * Auth: RADAR_ONE_TIME_RECOVERY_0901_TOKEN or existing RADAR_CRON_SECRET.
 * Becomes inert after successful completion (completion marker in radar_jobs).
 */

type Body = {
  dry_run?: boolean;
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

function rejectScopeMutation(body: Record<string, unknown>): string | null {
  const forbidden = [
    "snapshot_date",
    "pipeline_run_id",
    "member_id",
    "member_ids",
    "member_limit",
    "sql",
    "job_type",
    "operation",
  ];
  for (const key of forbidden) {
    if (key in body && body[key] !== undefined) {
      return key;
    }
  }
  return null;
}

export async function POST(request: Request) {
  if (!isOneTimeRecovery0901Configured()) {
    return noStoreJson({ error: "one_time_recovery_not_configured" }, { status: 503 });
  }
  if (!isOneTimeRecovery0901Authorized(request)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return noStoreJson({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  const { url: supabase_url } = readSupabaseServiceEnv();
  if (!supabase_url.includes(ONE_TIME_RECOVERY_0901.supabase_project)) {
    return noStoreJson({ error: "wrong_supabase_project" }, { status: 503 });
  }

  let body: Body = {};
  try {
    const parsed = (await request.json()) as Record<string, unknown>;
    const rejected = rejectScopeMutation(parsed);
    if (rejected) {
      return noStoreJson(
        {
          error: "scope_mutation_rejected",
          detail: `One-time recovery scope is hardcoded; cannot set ${rejected}.`,
        },
        { status: 403 },
      );
    }
    body = { dry_run: parsed.dry_run === true };
  } catch {
    body = {};
  }

  try {
    const client = createSupabaseServiceClient();
    const ctx = createWorkerContext();
    const result = await runOneTimeRecovery0901(client, ctx, { dry_run: body.dry_run });
    return noStoreJson(
      {
        one_time_recovery: ONE_TIME_RECOVERY_0901.recovery_label,
        ...result,
      },
      { status: result.inert ? 410 : result.ok ? 200 : 500 },
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "one_time_recovery_failed";
    return noStoreJson({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!isOneTimeRecovery0901Configured()) {
    return noStoreJson({ error: "one_time_recovery_not_configured" }, { status: 503 });
  }
  if (!isOneTimeRecovery0901Authorized(request)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return noStoreJson({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  const client = createSupabaseServiceClient();
  const ctx = createWorkerContext();
  const result = await runOneTimeRecovery0901(client, ctx, { dry_run: true });
  return noStoreJson({
    read_only: true,
    one_time_recovery: ONE_TIME_RECOVERY_0901.recovery_label,
    scope: {
      snapshot_date: ONE_TIME_RECOVERY_0901.snapshot_date,
      pipeline_run_id: ONE_TIME_RECOVERY_0901.pipeline_run_id,
      supabase_project: ONE_TIME_RECOVERY_0901.supabase_project,
    },
    would_rebuild_empty_members: result.before_empty_count,
    inert: result.inert,
  });
}
