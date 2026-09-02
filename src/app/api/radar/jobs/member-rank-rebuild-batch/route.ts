import { noStoreJson } from "@/lib/radar/jobs/auto-drain";
import {
  loadSnapshotGeneratedAt,
  recoverySucceeded,
  snapshotWasRecomputed,
  summarizeRecoveryEvidence,
  type SnapshotEvidenceRow,
} from "@/lib/radar/jobs/recovery-evidence";
import { runMemberRankRebuild } from "@/lib/radar/jobs/run-member-rank-rebuild";
import { createSupabaseRadarJobQueue } from "@/lib/radar/jobs/supabase-queue-store";
import { SupabasePipelineStore } from "@/lib/radar/pipeline/supabase-pipeline-store";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { createSourceAdapterRegistry } from "@/lib/radar/sources/registry";
import {
  createSupabaseServiceClient,
  isRadarCronAuthorized,
  isSupabaseServiceConfigured,
  readSupabaseServiceEnv,
} from "@/lib/supabase/service-client";
import type { WorkerContext } from "@/lib/radar/jobs/workers/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Batch Rank rebuild for members with empty Top20 on an approved pipeline day.
 * Reuses existing score snapshots — no upstream AI rerun.
 */

type Body = {
  snapshot_date?: string;
  pipeline_run_id?: string;
  dry_run?: boolean;
  member_limit?: number;
};

const APPROVED_BATCH = {
  snapshot_date: "2026-09-01",
  pipeline_run_id: "9e484340-4ccd-4c8c-9271-430705cae699",
  label: "SCORE_RANK_CONTRACT_BATCH_2026-09-01",
};

const PROD_SUPABASE_PROJECT = "ubdrkrvyyrqdvlehzhsz";

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

  const { url: supabase_url } = readSupabaseServiceEnv();
  if (!supabase_url.includes(PROD_SUPABASE_PROJECT)) {
    return noStoreJson(
      {
        error: "wrong_supabase_project",
        detail: `Expected Production project ${PROD_SUPABASE_PROJECT}.`,
        supabase_url_host: new URL(supabase_url).host,
      },
      { status: 503 },
    );
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const snapshot_date = body.snapshot_date?.trim() ?? APPROVED_BATCH.snapshot_date;
  const pipeline_run_id = body.pipeline_run_id?.trim() ?? APPROVED_BATCH.pipeline_run_id;
  if (
    snapshot_date !== APPROVED_BATCH.snapshot_date ||
    pipeline_run_id !== APPROVED_BATCH.pipeline_run_id
  ) {
    return noStoreJson(
      { error: "batch_guard_rejected", detail: "Only the approved 2026-09-01 run is allowed." },
      { status: 403 },
    );
  }

  const client = createSupabaseServiceClient();
  const { data: snapshots, error } = await client
    .from("member_daily_top20")
    .select("member_id, item_count")
    .eq("snapshot_date", snapshot_date);
  if (error) {
    return noStoreJson({ error: error.message }, { status: 500 });
  }

  const emptyMembers = (snapshots ?? [])
    .filter((row) => Number(row.item_count ?? 0) === 0)
    .map((row) => String(row.member_id));

  const before_empty_count = emptyMembers.length;
  const before_histogram: Record<string, number> = {};
  for (const row of snapshots ?? []) {
    const key = String(Number(row.item_count ?? 0));
    before_histogram[key] = (before_histogram[key] ?? 0) + 1;
  }

  const member_limit = Math.min(Math.max(body.member_limit ?? emptyMembers.length, 1), 200);
  const targets = emptyMembers.slice(0, member_limit);

  if (body.dry_run) {
    return noStoreJson({
      ok: true,
      dry_run: true,
      snapshot_date,
      pipeline_run_id,
      supabase_project: PROD_SUPABASE_PROJECT,
      before_empty_count,
      before_histogram,
      members_requested: targets.length,
      member_ids: targets,
    });
  }

  const ctx = createWorkerContext();
  const evidence: SnapshotEvidenceRow[] = [];

  for (const member_id of targets) {
    const beforeSnapshot = await loadSnapshotGeneratedAt(client, member_id, snapshot_date);
    const rebuild = await runMemberRankRebuild(ctx, {
      member_id,
      snapshot_date,
      pipeline_run_id,
      recovery_tag: APPROVED_BATCH.label,
      force_new_job: true,
    });
    const afterSnapshot = await loadSnapshotGeneratedAt(client, member_id, snapshot_date);
    evidence.push({
      member_id,
      previous_generated_at: beforeSnapshot.generated_at,
      new_generated_at: afterSnapshot.generated_at,
      previous_item_count: beforeSnapshot.item_count,
      new_item_count: afterSnapshot.item_count,
      snapshot_updated: snapshotWasRecomputed(
        beforeSnapshot.generated_at,
        afterSnapshot.generated_at,
      ),
      rebuild,
    });
  }

  const { data: afterSnapshots } = await client
    .from("member_daily_top20")
    .select("member_id, item_count")
    .eq("snapshot_date", snapshot_date);

  let after_empty_count = 0;
  const after_histogram: Record<string, number> = {};
  for (const row of afterSnapshots ?? []) {
    const n = Number(row.item_count ?? 0);
    if (n === 0) after_empty_count += 1;
    const key = String(n);
    after_histogram[key] = (after_histogram[key] ?? 0) + 1;
  }

  const summary = summarizeRecoveryEvidence(evidence);
  const ok = recoverySucceeded({
    members_requested: summary.members_requested,
    snapshots_updated: summary.snapshots_updated,
  });

  return noStoreJson({
    ok,
    snapshot_date,
    pipeline_run_id,
    supabase_project: PROD_SUPABASE_PROJECT,
    before_empty_count,
    after_empty_count,
    before_histogram,
    after_histogram,
    ...summary,
    failure_reason:
      ok || summary.members_requested === 0
        ? null
        : "zero_snapshots_recomputed",
    evidence,
  });
}
