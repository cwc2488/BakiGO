import { noStoreJson } from "@/lib/radar/jobs/auto-drain";
import { loadMemberSnapshotGapReport } from "@/lib/radar/jobs/member-snapshot-gap";
import { runMemberRankRebuild } from "@/lib/radar/jobs/run-member-rank-rebuild";
import { createSupabaseRadarJobQueue } from "@/lib/radar/jobs/supabase-queue-store";
import { SupabasePipelineStore } from "@/lib/radar/pipeline/supabase-pipeline-store";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { createSourceAdapterRegistry } from "@/lib/radar/sources/registry";
import {
  createSupabaseServiceClient,
  isRadarCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import type { WorkerContext } from "@/lib/radar/jobs/workers/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single-member Rank recovery — re-ranks from existing score snapshots only.
 * Does not rebuild discovery, analyze, or score upstream stages.
 */

type Body = {
  member_id?: string;
  snapshot_date?: string;
  pipeline_run_id?: string;
  dry_run?: boolean;
  force?: boolean;
};

type ApprovedRecovery = {
  member_id: string;
  snapshot_date: string;
  pipeline_run_id: string;
  label: string;
};

const APPROVED_RECOVERIES: ApprovedRecovery[] = [
  {
    member_id: "f8359859-b5f7-4c97-b0b1-7a5a2ab9fd92",
    snapshot_date: "2026-08-27",
    pipeline_run_id: "64499623-d0ff-4b4f-8336-2a17091af7cc",
    label: "RADAR-MEMBER-SNAPSHOT-GAP-01",
  },
  {
    member_id: "f8359859-b5f7-4c97-b0b1-7a5a2ab9fd92",
    snapshot_date: "2026-09-01",
    pipeline_run_id: "9e484340-4ccd-4c8c-9271-430705cae699",
    label: "SCORE_RANK_CONTRACT_2026-09-01",
  },
];

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

function findApprovedRecovery(input: {
  member_id: string;
  snapshot_date: string;
  pipeline_run_id: string;
}): ApprovedRecovery | null {
  return (
    APPROVED_RECOVERIES.find(
      (row) =>
        row.member_id === input.member_id &&
        row.snapshot_date === input.snapshot_date &&
        row.pipeline_run_id === input.pipeline_run_id,
    ) ?? null
  );
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

  const approved = findApprovedRecovery({ member_id, snapshot_date, pipeline_run_id });
  if (!approved) {
    return noStoreJson(
      {
        error: "recovery_guard_rejected",
        detail: "Member/date/run is not on the approved recovery allowlist.",
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

  const hasNonEmptySnapshot =
    before.snapshot.exists && Number(before.snapshot.item_count ?? 0) > 0;
  if (hasNonEmptySnapshot && !body.force) {
    return noStoreJson({
      ok: true,
      skipped: true,
      reason: "snapshot_already_populated",
      before,
    });
  }

  if (body.dry_run) {
    return noStoreJson({
      ok: true,
      dry_run: true,
      would_rebuild_rank: true,
      recovery_label: approved.label,
      before,
    });
  }

  const ctx = createWorkerContext();
  const rebuild = await runMemberRankRebuild(ctx, {
    member_id,
    snapshot_date,
    pipeline_run_id,
    recovery_tag: approved.label,
  });

  const after = await loadMemberSnapshotGapReport(client, {
    member_id,
    snapshot_date,
    pipeline_run_id,
  });

  return noStoreJson({
    ok: rebuild.ok,
    recovered: rebuild.ok && Number(after.snapshot.item_count ?? 0) > 0,
    recovery_label: approved.label,
    rebuild,
    before,
    after,
  });
}
