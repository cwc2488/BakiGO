import { randomUUID } from "node:crypto";
import { runCandidateAnalysis } from "../../ai/analyze-candidate";
import { validateUpstreamArtifact } from "../chain";
import type { RadarJobRecord } from "../types";
import {
  enqueueScoreJobsForMembers,
  enrichPayload,
  type WorkerContext,
  type WorkerResult,
} from "./dispatch";

export async function runAnalyzeWorker(
  ctx: WorkerContext,
  job: RadarJobRecord,
): Promise<WorkerResult> {
  const payload = enrichPayload(job);
  const candidate_id = String(payload.candidate_id ?? "");
  const run_date = String(payload.run_date ?? "");
  const now = ctx.now ?? new Date();

  let normalization_run_id: string;
  try {
    normalization_run_id = validateUpstreamArtifact(job, "normalization_run_id");
  } catch (error) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "MISSING_ARTIFACT",
      error_message: error instanceof Error ? error.message : "missing normalization artifact",
    };
  }

  const corpus = await ctx.repo.getNormalizationRun(normalization_run_id);
  if (!corpus || corpus.candidate_id !== candidate_id) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "MISSING_ARTIFACT",
      error_message: "normalize artifact not available for analyze",
    };
  }

  const outcome = await runCandidateAnalysis({
    repo: ctx.repo,
    corpus,
    normalization_run_id,
    provider: ctx.llm,
    referenceDate: now,
  });

  if (outcome.kind === "failed") {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "SCHEMA_VALIDATION",
      error_message: outcome.analysis_run.error_message ?? "invalid extraction",
      metrics: outcome.telemetry
        ? {
            openai_calls: outcome.telemetry.openai_calls,
            repair_attempted: outcome.telemetry.repair_attempted,
            repair_succeeded: outcome.telemetry.repair_succeeded,
            conformance_actions: outcome.telemetry.conformance_actions,
          }
        : undefined,
    };
  }

  const analysis_run_id = outcome.analysis_run.id;

  if (outcome.kind === "analyzed" && outcome.analysis_run.extraction_json) {
    const baselineId = randomUUID();
    const { computeMemberOverlayScore } = await import("../../scoring/compute-member-score");
    const baseline = computeMemberOverlayScore({
      extraction: outcome.analysis_run.extraction_json,
      corpus,
      referenceDate: now,
    });
    await ctx.repo.insertBaselineScoreSnapshot({
      id: baselineId,
      candidate_id,
      analysis_run_id,
      overall_score: baseline.overall_score,
      component_scores: baseline.components as unknown as Record<string, unknown>,
      core_traits_audit: baseline.core_traits as unknown as Record<string, unknown>,
    });
  }

  const members = ctx.scoreMemberIds?.length
    ? ctx.scoreMemberIds.map((member_id) => ({ member_id }))
    : await ctx.repo.listActiveMembers();
  await enqueueScoreJobsForMembers(ctx, {
    pipeline_run_id: job.pipeline_run_id,
    run_date,
    candidate_id,
    analysis_run_id,
    member_ids: members.map((member) => member.member_id),
  });

  return {
    job_id: job.id,
    status: "succeeded",
    metrics: {
      analysis_run_id,
      cache_hit: outcome.kind === "cache_hit",
      openai_calls: outcome.telemetry?.openai_calls ?? 0,
      repair_attempted: outcome.telemetry?.repair_attempted ?? false,
      repair_succeeded: outcome.telemetry?.repair_succeeded ?? false,
      conformance_actions: outcome.telemetry?.conformance_actions ?? [],
      total_tokens: (outcome.telemetry?.usage ?? []).reduce(
        (sum, usage) => sum + usage.total_tokens,
        0,
      ),
    },
  };
}
