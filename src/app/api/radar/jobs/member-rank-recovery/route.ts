import { noStoreJson } from "@/lib/radar/jobs/auto-drain";
import { pipelineJobKey } from "@/lib/radar/jobs/chain";
import { loadMemberSnapshotGapReport } from "@/lib/radar/jobs/member-snapshot-gap";
import { createSupabaseRadarJobQueue } from "@/lib/radar/jobs/supabase-queue-store";
import { processClaimedJob, type WorkerContext } from "@/lib/radar/jobs/workers/dispatch";
import { SupabasePipelineStore } from "@/lib/radar/pipeline/supabase-pipeline-store";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { createSourceAdapterRegistry } from "@/lib/radar/sources/registry";
import {
  createSupabaseServiceClient,
  isRadarCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import type { RadarJobRecord } from "@/lib/radar/jobs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RADAR-MEMBER-SNAPSHOT-GAP-01 — single-member rank recovery only.
 * Does not rebuild org run, discovery, analyze, or other members' snapshots.
 */

type Body = {
  member_id?: string;
  snapshot_date?: string;
  pipeline_run_id?: string;
  dry_run?: boolean;
};

const APPROVED_MEMBER_ID = "f8359859-b5f7-4c97-b0b1-7a5a2ab9fd92";
const APPROVED_DATE = "2026-08-27";
const APPROVED_RUN_ID = "64499623-d0ff-4b4f-8336-2a17091af7cc";

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

export async function POST(request: Request) {
  if (!isRadarCronAuthorized(request)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return noStoreJson({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return noStoreJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  const member_id = body.member_id?.trim() ?? "";
  const snapshot_date = body.snapshot_date?.trim() ?? "";
  const pipeline_run_id = body.pipeline_run_id?.trim() ?? "";
  if (!member_id || !snapshot_date || !pipeline_run_id) {
    return noStoreJson(
      { error: "member_id, snapshot_date, and pipeline_run_id are required" },
      { status: 400 },
    );
  }

  // Hard guard: only the proven 2026-08-27 gap recovery member/date/run.
  if (
    snapshot_date !== APPROVED_DATE ||
    pipeline_run_id !== APPROVED_RUN_ID ||
    member_id !== APPROVED_MEMBER_ID
  ) {
    return noStoreJson(
      {
        error: "recovery_guard_rejected",
        detail: "Only the approved 2026-08-27 Partner 巴其 single-member recovery is allowed.",
      },
      { status: 403 },
    );
  }

  const client = createSupabaseServiceClient();
  const before = await loadMemberSnapshotGapReport(client, {
    member_id,
    snapshot_date,
    pipeline_run_id,
  });

  if (before.snapshot.exists) {
    return noStoreJson({
      ok: true,
      skipped: true,
      reason: "snapshot_already_exists",
      before,
    });
  }

  if (before.rank_jobs.some((job) => job.status === "succeeded")) {
    return noStoreJson(
      {
        ok: false,
        error: "rank_succeeded_without_snapshot",
        before,
      },
      { status: 409 },
    );
  }

  if (body.dry_run) {
    return noStoreJson({
      ok: true,
      dry_run: true,
      would_enqueue_rank: true,
      before,
    });
  }

  const ctx = createWorkerContext();
  const now = new Date();
  const { job: enqueued } = await ctx.queue.enqueue(
    {
      pipeline_run_id,
      job_type: "rank",
      idempotency_key: pipelineJobKey(snapshot_date, [
        "rank",
        member_id,
        "member_snapshot_gap_01",
      ]),
      payload: {
        run_date: snapshot_date,
        member_id,
        artifact_refs: {},
        recovery: "RADAR-MEMBER-SNAPSHOT-GAP-01",
      },
      priority: 100_000,
    },
    now,
  );

  if (enqueued.status === "succeeded") {
    const afterExisting = await loadMemberSnapshotGapReport(client, {
      member_id,
      snapshot_date,
      pipeline_run_id,
    });
    return noStoreJson({
      ok: afterExisting.snapshot.exists,
      skipped: true,
      reason: "recovery_rank_already_succeeded",
      enqueued_job_id: enqueued.id,
      before,
      after: afterExisting,
    });
  }

  // Mark running then process via the same worker path as claim+dispatch.
  const { error: claimError } = await client
    .from("radar_jobs")
    .update({
      status: "running",
      started_at: now.toISOString(),
      attempt_count: Number(enqueued.attempt_count ?? 0) + 1,
      updated_at: now.toISOString(),
    })
    .eq("id", enqueued.id)
    .in("status", ["pending", "failed", "running"]);
  if (claimError) {
    return noStoreJson(
      { ok: false, error: claimError.message, enqueued_job_id: enqueued.id },
      { status: 500 },
    );
  }

  const claimed: RadarJobRecord = {
    ...enqueued,
    status: "running",
    started_at: now.toISOString(),
    attempt_count: Number(enqueued.attempt_count ?? 0) + 1,
    updated_at: now.toISOString(),
  };

  await processClaimedJob({ ...ctx, now }, claimed);

  const after = await loadMemberSnapshotGapReport(client, {
    member_id,
    snapshot_date,
    pipeline_run_id,
  });

  return noStoreJson({
    ok: true,
    recovered: after.snapshot.exists,
    enqueued_job_id: enqueued.id,
    before,
    after,
  });
}
