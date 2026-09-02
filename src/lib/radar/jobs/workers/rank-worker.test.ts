import { describe, expect, it } from "vitest";
import { InMemoryRadarRepository } from "../../repository/in-memory-repository";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../queue";
import { createSourceAdapterRegistry } from "../../sources/registry";
import { runRankWorker } from "./rank-worker";
import type { RadarJobRecord } from "../types";
import type { OverallScoreResult } from "../../scoring/types";

function scoreResult(overall: number): OverallScoreResult {
  return {
    scoring_version: "v1",
    overall_score: overall,
    components: {
      change_window_score: 20,
      change_intent_score: 8,
      behavioral_change_score: 6,
      solution_gap_score: 6,
      needs_fit_score: 15,
      contactability_score: 10,
      natural_entry_score: 6,
      interaction_openness_score: 4,
      core_traits_score: 3,
      activity_score: 3,
      location_score: 2.5,
    },
    core_traits: {
      trait_scores: [],
      core_traits_score: 3,
      profile_observability: {
        profile_observability_level: "medium",
        analyzable_item_count: 10,
        excluded_repost_count: 0,
        excluded_duplicate_count: 0,
        excluded_empty_share_count: 0,
        excluded_no_expression_count: 0,
        excluded_unattributable_count: 0,
      },
      trait_observability: [],
    },
    needs: [],
  };
}

describe("runRankWorker freshness gate", () => {
  it("excludes stale source from Top20 and keeps a fresh analyzed candidate", async () => {
    const repo = new InMemoryRadarRepository();
    const now = new Date("2026-08-21T08:00:00.000Z");
    await repo.upsertCandidate({ id: "cand_fresh", display_name: "fresh" });
    await repo.upsertCandidate({ id: "cand_stale", display_name: "stale" });

    const fingerprint = "fp_match";
    const corpusFp = "corpus_match";
    await repo.insertAnalysisRun({
      id: "11111111-1111-4111-8111-111111111111",
      candidate_id: "cand_fresh",
      status: "succeeded",
      analysis_input_fingerprint: fingerprint,
      corpus_fingerprint: corpusFp,
      profile_semantic_hash: null,
      normalization_run_id: "norm_fresh",
      extraction_json: { candidate_id: "cand_fresh" } as never,
      prompt_version: "ai_radar_extraction_v1.0",
      model_id: "gpt-4.1-mini",
    });
    await repo.insertAnalysisRun({
      id: "22222222-2222-4222-8222-222222222222",
      candidate_id: "cand_stale",
      status: "succeeded",
      analysis_input_fingerprint: fingerprint,
      corpus_fingerprint: corpusFp,
      profile_semantic_hash: null,
      normalization_run_id: "norm_stale",
      extraction_json: { candidate_id: "cand_stale" } as never,
      prompt_version: "ai_radar_extraction_v1.0",
      model_id: "gpt-4.1-mini",
    });

    await repo.updateRefreshStateAfterNormalize({
      candidate_id: "cand_fresh",
      corpus_fingerprint: corpusFp,
      profile_semantic_hash: null,
      data_completeness: "full",
      current_analysis_run_id: "11111111-1111-4111-8111-111111111111",
      validated_extraction_fingerprint: fingerprint,
      now,
    });
    await repo.updateRefreshStateAfterEnrich({
      candidate_id: "cand_fresh",
      succeeded: true,
      now,
    });
    await repo.updateRefreshStateAfterNormalize({
      candidate_id: "cand_stale",
      corpus_fingerprint: corpusFp,
      profile_semantic_hash: null,
      data_completeness: "full",
      current_analysis_run_id: "22222222-2222-4222-8222-222222222222",
      validated_extraction_fingerprint: fingerprint,
      now,
    });
    const staleState = await repo.getRefreshState("cand_stale");
    if (staleState) staleState.last_source_check_at = "2026-07-01T00:00:00.000Z";

    await repo.insertMemberScoreSnapshot({
      id: "score_fresh",
      member_id: "member-1",
      candidate_id: "cand_fresh",
      analysis_run_id: "11111111-1111-4111-8111-111111111111",
      baseline_score_snapshot_id: "b1",
      overall_score: 80,
      component_scores: {},
      location_level: "unknown",
      snapshot_date: "2026-08-21",
      result: scoreResult(80),
    });
    await repo.insertMemberScoreSnapshot({
      id: "score_stale",
      member_id: "member-1",
      candidate_id: "cand_stale",
      analysis_run_id: "22222222-2222-4222-8222-222222222222",
      baseline_score_snapshot_id: "b2",
      overall_score: 90,
      component_scores: {},
      location_level: "unknown",
      snapshot_date: "2026-08-21",
      result: scoreResult(90),
    });

    const job: RadarJobRecord = {
      id: "rank-1",
      pipeline_run_id: null,
      job_type: "rank",
      idempotency_key: "k",
      status: "running",
      payload: {
        run_date: "2026-08-21",
        member_id: "member-1",
        artifact_refs: {},
      },
      priority: 0,
      attempt_count: 1,
      max_attempts: 3,
      scheduled_at: "",
      available_at: "",
      started_at: null,
      finished_at: null,
      error_code: null,
      error_message: null,
      trace_id: null,
      created_at: "",
      updated_at: "",
    };

    const result = await runRankWorker(
      {
        repo,
        queue: new RadarJobQueue(new InMemoryRadarJobQueueStore()),
        sources: createSourceAdapterRegistry(),
        now,
      },
      job,
    );

    expect(result.status).toBe("succeeded");
    expect(result.metrics?.skipped_freshness_or_analysis).toBe(1);
    const top20 = await repo.getMemberDailyTop20("member-1", "2026-08-21");
    expect(top20?.items).toHaveLength(1);
    expect(top20?.items[0]?.candidateId).toBe("cand_fresh");
  });
});
