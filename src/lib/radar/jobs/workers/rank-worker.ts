import { isSourceFresh, qualifiesForTop20Analysis } from "../../analysis/fingerprint";
import { allocationBlockFor } from "../../allocation/allocation-eligibility";
import { capDailyRecommendations, parseAllocationRules } from "../../allocation/allocation-rules";
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
  const config = await ctx.repo.getPipelineConfig();
  const rules = parseAllocationRules(config.allocation);
  const claims = await ctx.repo.listCandidateDevelopmentClaims(
    scored.map((entry) => entry.candidate_id),
  );
  const claimByCandidate = new Map(claims.map((claim) => [claim.candidate_id, claim]));

  const eligible = [];
  let skipped_freshness_or_analysis = 0;
  let skipped_member_handled = 0;
  let skipped_allocation_locked = 0;
  let skipped_below_minimum_score = 0;
  for (const entry of scored) {
    const state = await ctx.repo.getMemberCandidateState(member_id, entry.candidate_id);
    const block = allocationBlockFor({
      member_id,
      state,
      claim: claimByCandidate.get(entry.candidate_id) ?? null,
      overall_score: entry.result.overall_score,
      now,
      rules,
    });
    if (block === "below_minimum_score") {
      skipped_below_minimum_score += 1;
      continue;
    }
    if (block === "allocation_locked") {
      skipped_allocation_locked += 1;
      continue;
    }
    if (block) {
      skipped_member_handled += 1;
      continue;
    }

    const refresh = await ctx.repo.getRefreshState(entry.candidate_id);
    const analysis = await ctx.repo.getAnalysisRun(entry.analysis_run_id);
    const source_fresh = isSourceFresh({
      now,
      last_source_check_at: refresh?.last_source_check_at ?? null,
      source_freshness_window_days: config.source_freshness_window_days,
    });
    const analysisEligible = qualifiesForTop20Analysis({
      source_fresh,
      corpus_fingerprint: refresh?.corpus_fingerprint ?? null,
      analysis_corpus_fingerprint: analysis?.corpus_fingerprint ?? null,
      validated_extraction_fingerprint: refresh?.validated_extraction_fingerprint ?? null,
      analysis_input_fingerprint: analysis?.analysis_input_fingerprint ?? null,
      has_validated_extraction:
        analysis?.status === "succeeded" && Boolean(analysis.extraction_json),
    });
    if (!analysisEligible) {
      skipped_freshness_or_analysis += 1;
      continue;
    }

    eligible.push({
      candidateId: entry.candidate_id,
      result: entry.result,
    });
  }

  // A shorter list is the correct answer when fewer candidates qualify. On a
  // re-run the cap applies to the whole day, so already-recommended candidates
  // keep their place and cannot be joined by more than the day's remaining slots.
  const alreadyRecommendedToday = new Set(
    await ctx.repo.listRecommendedCandidateIds({ member_id, snapshot_date: run_date }),
  );
  const ranked = capDailyRecommendations(rankCandidates(eligible), {
    already_recommended_today: alreadyRecommendedToday,
    rules,
    // Ranks stay contiguous even when the cap drops someone mid-list.
  }).map((item, index) => ({ ...item, rank: index + 1 }));

  // One snapshot per member per day: a re-run replaces today's content and
  // keeps the snapshot identity the occurrence audit refers to.
  const snapshot = await ctx.repo.upsertMemberDailyTop20({
    member_id,
    pipeline_run_id: job.pipeline_run_id ?? "",
    snapshot_date: run_date,
    generated_at: now,
    items: ranked,
  });

  const analysisRunIds = Object.fromEntries(
    scored.map((entry) => [entry.candidate_id, entry.analysis_run_id]),
  );

  const occurrences = await ctx.repo.appendRecommendationOccurrences({
    member_id,
    member_daily_top20_id: snapshot.id,
    snapshot_date: run_date,
    items: ranked,
    analysis_run_ids: analysisRunIds,
  });

  return {
    job_id: job.id,
    status: "succeeded",
    metrics: {
      item_count: ranked.length,
      skipped_freshness_or_analysis,
      skipped_member_handled,
      skipped_allocation_locked,
      skipped_below_minimum_score,
      full_precision_top_score: ranked[0]?.overall_score ?? null,
      snapshot_id: snapshot.id,
      occurrences_appended: occurrences.appended,
      occurrences_skipped_existing: occurrences.skipped_existing,
    },
  };
}
