import { randomUUID } from "node:crypto";
import { isExcludedFromMemberRecommendations } from "../../jobs/constants";
import { rankCandidates } from "../../scoring/rank-candidates";
import type { RadarJobRecord } from "../types";
import { enrichPayload, type WorkerContext, type WorkerResult } from "./dispatch";

export async function runRankWorker(
  ctx: WorkerContext,
  job: RadarJobRecord,
): Promise<WorkerResult> {
  const payload = enrichPayload(job);
  const member_id = String(payload.member_id ?? "");
  const run_date = String(payload.run_date ?? "");
  const now = ctx.now ?? new Date();

  const scored = await ctx.repo.listMemberScoreSnapshots({
    member_id,
    snapshot_date: run_date,
  });

  const eligible = [];
  for (const entry of scored) {
    const state = await ctx.repo.getMemberCandidateState(member_id, entry.candidate_id);
    if (
      state &&
      isExcludedFromMemberRecommendations({
        development_state: state.development_state,
        excluded_from_recommendations: state.excluded_from_recommendations,
      })
    ) {
      continue;
    }
    eligible.push({
      candidateId: entry.candidate_id,
      result: entry.result,
    });
  }

  const ranked = rankCandidates(eligible).slice(0, 20);

  const top20Id = randomUUID();
  await ctx.repo.insertMemberDailyTop20({
    id: top20Id,
    member_id,
    pipeline_run_id: job.pipeline_run_id ?? "",
    snapshot_date: run_date,
    generated_at: now,
    items: ranked,
  });

  const analysisRunIds = Object.fromEntries(
    scored.map((entry) => [entry.candidate_id, entry.analysis_run_id]),
  );

  await ctx.repo.appendRecommendationOccurrences({
    member_id,
    member_daily_top20_id: top20Id,
    snapshot_date: run_date,
    items: ranked,
    analysis_run_ids: analysisRunIds,
  });

  return {
    job_id: job.id,
    status: "succeeded",
    metrics: {
      item_count: ranked.length,
      full_precision_top_score: ranked[0]?.overall_score ?? null,
    },
  };
}
