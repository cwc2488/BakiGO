import type { Platform } from "../../normalization/schema";
import type { RadarJobRecord } from "../types";
import {
  enqueueNormalizeAfterEnrich,
  enrichPayload,
  type WorkerContext,
  type WorkerResult,
} from "./dispatch";

export async function runEnrichWorker(
  ctx: WorkerContext,
  job: RadarJobRecord,
): Promise<WorkerResult> {
  const payload = enrichPayload(job);
  const candidate_id = String(payload.candidate_id ?? "");
  const run_date = String(payload.run_date ?? "");
  const now = ctx.now ?? new Date();

  if (!candidate_id) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "INVALID_PAYLOAD",
      error_message: "enrich job missing candidate_id",
    };
  }

  const candidate = await ctx.repo.getCandidate(candidate_id);
  const platform = (payload.platform as Platform | undefined) ?? candidate?.primary_platform ?? "threads";
  const username = payload.username ? String(payload.username) : candidate?.normalized_username ?? null;
  const adapter = ctx.sources.forPlatform(platform);

  let enrichResult;
  try {
    enrichResult = await adapter.enrichCandidate({
      candidate_id,
      platform,
      external_user_id: payload.external_user_id ? String(payload.external_user_id) : null,
      username,
      context: {
        pipeline_run_id: job.pipeline_run_id,
        job_id: job.id,
      },
    });
  } catch (error) {
    await ctx.repo.updateRefreshStateAfterEnrich({
      candidate_id,
      succeeded: false,
      enrichment_capability_state: "source_unavailable",
      now,
    });
    return {
      job_id: job.id,
      status: "failed",
      error_code: "UPSTREAM_5XX",
      error_message: error instanceof Error ? error.message : "enrich failed",
    };
  }

  const rawSnapshotIds = await ctx.repo.insertRawSnapshots({
    candidate_id,
    platform,
    snapshots: enrichResult.raw_snapshots,
    pipeline_run_id: job.pipeline_run_id,
    enrich_job_id: job.id,
  });

  const config = await ctx.repo.getPipelineConfig();
  const freshnessUntil = new Date(
    now.getTime() + config.source_freshness_window_days * 24 * 60 * 60 * 1000,
  );

  await ctx.repo.updateRefreshStateAfterEnrich({
    candidate_id,
    succeeded: true,
    fetch_completeness: enrichResult.fetch_completeness,
    profile_semantic_hash: enrichResult.profile_semantic_hash,
    source_freshness_valid_until: freshnessUntil,
    enrichment_capability_state: enrichResult.capability_state ?? "available",
    now,
  });

  await ctx.repo.upsertCandidate({
    id: candidate_id,
    profile_semantic_hash: enrichResult.profile_semantic_hash,
  });

  // Secondary IG enrichment when Threads username is known — no auto identity merge.
  if (platform === "threads" && username) {
    await attemptInstagramEnrichment(ctx, {
      candidate_id,
      username,
      job,
      run_date,
      now,
    });
  }

  await enqueueNormalizeAfterEnrich(ctx, {
    pipeline_run_id: job.pipeline_run_id,
    run_date,
    candidate_id,
    enrich_job_id: job.id,
    raw_snapshot_ids: rawSnapshotIds,
    priority: job.priority,
  });

  return {
    job_id: job.id,
    status: "succeeded",
    metrics: {
      raw_snapshot_count: rawSnapshotIds.length,
      fetch_completeness: enrichResult.fetch_completeness,
      capability_state: enrichResult.capability_state ?? "available",
    },
  };
}

async function attemptInstagramEnrichment(
  ctx: WorkerContext,
  input: {
    candidate_id: string;
    username: string;
    job: RadarJobRecord;
    run_date: string;
    now: Date;
  },
): Promise<void> {
  const igAdapter = ctx.sources.forPlatform("instagram");
  try {
    const igResult = await igAdapter.enrichCandidate({
      candidate_id: input.candidate_id,
      platform: "instagram",
      username: input.username,
      context: {
        pipeline_run_id: input.job.pipeline_run_id,
        job_id: input.job.id,
      },
    });

    if (igResult.raw_snapshots.length === 0) return;

    await ctx.repo.insertRawSnapshots({
      candidate_id: input.candidate_id,
      platform: "instagram",
      snapshots: igResult.raw_snapshots,
      pipeline_run_id: input.job.pipeline_run_id,
      enrich_job_id: input.job.id,
    });
  } catch {
    // Personal/consumer IG or Business Discovery miss — Threads candidate remains valid.
  }
}
