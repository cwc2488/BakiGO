import { decideAnalyzeCandidate } from "../../ai/analyze-candidate";
import { normalizeCandidateContent } from "../../normalization/normalize-candidate-content";
import type { RawContentSnapshot } from "../../normalization/schema";
import { validateUpstreamArtifact } from "../chain";
import type { RadarJobRecord } from "../types";
import {
  enqueueAnalyzeAfterNormalize,
  enrichPayload,
  newNormalizationRunId,
  type WorkerContext,
  type WorkerResult,
} from "./dispatch";

export async function runNormalizeWorker(
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
      error_message: "normalize job missing candidate_id",
    };
  }

  let rawSnapshotIds: string[];
  try {
    const rawIdsValue = validateUpstreamArtifact(job, "raw_snapshot_ids");
    rawSnapshotIds = rawIdsValue.split(",");
  } catch (error) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "MISSING_ARTIFACT",
      error_message: error instanceof Error ? error.message : "missing enrich artifacts",
    };
  }

  const rawRows = await ctx.repo.listRawSnapshotsByIds(rawSnapshotIds);
  if (rawRows.length === 0) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "MISSING_ARTIFACT",
      error_message: "normalize cannot consume missing raw snapshots",
    };
  }

  const snapshots: RawContentSnapshot[] = rawRows.map((row) => ({
    raw_snapshot_id: row.raw_snapshot_id,
    candidate_id: row.candidate_id,
    platform: row.platform,
    external_content_id: row.external_content_id,
    fetched_at: row.fetched_at,
    adapter_version: row.adapter_version,
    fetch_completeness: row.fetch_completeness,
    payload: row.payload as RawContentSnapshot["payload"],
  }));

  const normalization_run_id = newNormalizationRunId(candidate_id, now);
  const corpus = normalizeCandidateContent({
    candidate_id,
    normalization_run_id,
    snapshots,
    referenceDate: now,
  });

  await ctx.repo.persistNormalizationRun(corpus);

  const decision = await decideAnalyzeCandidate(ctx.repo, corpus);
  const cacheReused = Boolean(decision.cached_analysis_run_id) && !decision.reanalyze;
  await ctx.repo.updateRefreshStateAfterNormalize({
    candidate_id,
    corpus_fingerprint: decision.corpus_fingerprint,
    profile_semantic_hash: (await ctx.repo.getCandidate(candidate_id))?.profile_semantic_hash ?? null,
    data_completeness: corpus.data_completeness,
    current_analysis_run_id: cacheReused ? decision.cached_analysis_run_id : undefined,
    validated_extraction_fingerprint: cacheReused ? decision.analysis_input_fingerprint : undefined,
    now,
  });

  if (decision.reanalyze || !decision.cached_analysis_run_id) {
    await enqueueAnalyzeAfterNormalize(ctx, {
      pipeline_run_id: job.pipeline_run_id,
      run_date,
      candidate_id,
      normalization_run_id,
      priority: job.priority,
    });
  } else if (decision.cached_analysis_run_id) {
    const members = await ctx.repo.listActiveMembers();
    const { enqueueScoreJobsForMembers } = await import("./dispatch");
    await enqueueScoreJobsForMembers(ctx, {
      pipeline_run_id: job.pipeline_run_id,
      run_date,
      candidate_id,
      analysis_run_id: decision.cached_analysis_run_id,
      member_ids: members.map((member) => member.member_id),
    });
  }

  return {
    job_id: job.id,
    status: "succeeded",
    metrics: {
      normalization_run_id,
      corpus_fingerprint: decision.corpus_fingerprint,
      analyze_enqueued: decision.reanalyze || !decision.cached_analysis_run_id,
      cache_reused: cacheReused,
    },
  };
}
