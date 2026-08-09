import { randomUUID } from "node:crypto";
import {
  computeMemberOverlayScore,
  isCandidateExcludedForMember,
  memberAreasToLocationContext,
  resolveMemberLocationLevel,
} from "../../scoring/compute-member-score";
import { validateUpstreamArtifact } from "../chain";
import type { RadarJobRecord } from "../types";
import {
  enrichPayload,
  maybeEnqueueRank,
  type WorkerContext,
  type WorkerResult,
} from "./dispatch";

export async function runScoreWorker(
  ctx: WorkerContext,
  job: RadarJobRecord,
): Promise<WorkerResult> {
  const payload = enrichPayload(job);
  const member_id = String(payload.member_id ?? "");
  const candidate_id = String(payload.candidate_id ?? "");
  const run_date = String(payload.run_date ?? "");
  const now = ctx.now ?? new Date();

  let analysis_run_id: string;
  try {
    analysis_run_id = validateUpstreamArtifact(job, "analysis_run_id");
  } catch (error) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "MISSING_ARTIFACT",
      error_message: error instanceof Error ? error.message : "missing analysis artifact",
    };
  }

  const analysisRun = await ctx.repo.getAnalysisRun(analysis_run_id);
  if (!analysisRun?.extraction_json || analysisRun.status !== "succeeded") {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "SCHEMA_VALIDATION",
      error_message: "invalid LLM extraction produces no score",
    };
  }

  const memberState = await ctx.repo.getMemberCandidateState(member_id, candidate_id);
  if (
    memberState &&
    isCandidateExcludedForMember({
      development_state: memberState.development_state,
      excluded_from_recommendations: memberState.excluded_from_recommendations,
    })
  ) {
    return {
      job_id: job.id,
      status: "succeeded",
      metrics: { excluded: true },
    };
  }

  const corpus = analysisRun.normalization_run_id
    ? await ctx.repo.getNormalizationRun(analysisRun.normalization_run_id)
    : await ctx.repo.getLatestNormalizationRun(candidate_id);

  if (!corpus) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "MISSING_ARTIFACT",
      error_message: "normalization corpus missing for score",
    };
  }

  const areas = await ctx.repo.getMemberDevelopmentAreas(member_id);
  const memberLocationContext = memberAreasToLocationContext(areas);
  const result = computeMemberOverlayScore({
    extraction: analysisRun.extraction_json,
    corpus,
    memberLocationContext,
    referenceDate: now,
  });
  const locationLevel = resolveMemberLocationLevel(
    analysisRun.extraction_json,
    memberLocationContext,
  );

  const baselineId = randomUUID();
  await ctx.repo.insertBaselineScoreSnapshot({
    id: baselineId,
    candidate_id,
    analysis_run_id,
    overall_score: result.overall_score,
    component_scores: result.components as unknown as Record<string, unknown>,
    core_traits_audit: result.core_traits as unknown as Record<string, unknown>,
  });

  await ctx.repo.insertMemberScoreSnapshot({
    id: randomUUID(),
    member_id,
    candidate_id,
    analysis_run_id,
    baseline_score_snapshot_id: baselineId,
    overall_score: result.overall_score,
    component_scores: result.components as unknown as Record<string, unknown>,
    location_level: locationLevel,
    snapshot_date: run_date,
    result,
  });

  if (job.pipeline_run_id) {
    await ctx.repo.incrementMemberScoreProgress({
      pipeline_run_id: job.pipeline_run_id,
      member_id,
    });
    await maybeEnqueueRank(ctx, {
      pipeline_run_id: job.pipeline_run_id,
      run_date,
      member_id,
    });
  }

  return {
    job_id: job.id,
    status: "succeeded",
    metrics: {
      overall_score: result.overall_score,
      location_level: locationLevel,
    },
  };
}
