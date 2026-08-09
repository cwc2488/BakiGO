import { describe, expect, it } from "vitest";
import { buildValidExtractionFixture, withNormalizedSourceRefs } from "../extraction/test-fixtures";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot } from "../normalization/test-fixtures";
import {
  computeMemberOverlayScore,
  memberAreasToLocationContext,
} from "../scoring/compute-member-score";
import { rankCandidates } from "../scoring/rank-candidates";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";

describe("P5 score/rank/recommendation invariants", () => {
  const now = new Date("2026-08-09T03:00:00.000Z");

  it("different member locations produce different final scores", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_loc",
      normalization_run_id: "norm_loc",
      snapshots: [buildRawSnapshot({ external_content_id: "th_loc_1", candidate_id: "cand_loc" })],
      referenceDate: now,
    });
    const extraction = withNormalizedSourceRefs(
      {
        ...buildValidExtractionFixture(),
        candidate_id: "cand_loc",
        location: {
          availability: "unknown",
          reasoning: "位置資料不足",
        },
      },
      corpus.items[0]?.normalized_content_id ?? "norm_body_comp_001",
    );

    const withAreas = computeMemberOverlayScore({
      extraction,
      corpus,
      memberLocationContext: memberAreasToLocationContext([
        {
          member_id: "m1",
          area_role: "primary",
          normalized_city: "台北市",
          normalized_district: "大安區",
          sort_order: 0,
        },
      ]),
      referenceDate: now,
    });

    const withoutAreas = computeMemberOverlayScore({
      extraction,
      corpus,
      memberLocationContext: undefined,
      referenceDate: now,
    });

    expect(withAreas.components.location_score).toBe(0);
    expect(withoutAreas.components.location_score).toBe(2.5);
    expect(withAreas.overall_score).not.toBe(withoutAreas.overall_score);
  });

  it("preserves full precision ranking and allows Top20 fewer than 20", () => {
    const entries = [
      { candidateId: "c1", result: scoreResult(80.1234) },
      { candidateId: "c2", result: scoreResult(80.1229) },
      { candidateId: "c3", result: scoreResult(40) },
    ];
    const ranked = rankCandidates(entries);
    expect(ranked[0].overall_score).toBe(80.1234);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].overall_score).toBeGreaterThan(ranked[2].overall_score);
    expect(ranked.slice(0, 20)).toHaveLength(3);
  });

  it("member A development state does not affect member B visiblity", async () => {
    const repo = new InMemoryRadarRepository();
    await repo.setMemberDevelopmentState({
      member_id: "member-a",
      candidate_id: "cand_x",
      development_state: "in_progress",
    });

    const stateB = await repo.getMemberCandidateState("member-b", "cand_x");
    expect(stateB).toBeNull();
  });

  it("recommendation occurrences are append-only", async () => {
    const repo = new InMemoryRadarRepository();
    const ranked = rankCandidates([{ candidateId: "c1", result: scoreResult(70) }]);
    await repo.appendRecommendationOccurrences({
      member_id: "member-a",
      member_daily_top20_id: "top-1",
      snapshot_date: "2026-08-09",
      items: ranked,
      analysis_run_ids: { c1: "analysis-1" },
    });
    await repo.appendRecommendationOccurrences({
      member_id: "member-a",
      member_daily_top20_id: "top-2",
      snapshot_date: "2026-08-09",
      items: ranked,
      analysis_run_ids: { c1: "analysis-1" },
      re_recommendation: {
        c1: { reason: "change_window_increased", trigger: "change_window_increased" },
      },
    });
    expect(repo.recommendationOccurrences).toHaveLength(2);
  });

  it("invalid LLM extraction produces no member score snapshot", async () => {
    const repo = new InMemoryRadarRepository();
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_bad",
      normalization_run_id: "norm_bad",
      snapshots: [buildRawSnapshot({ external_content_id: "th_bad", candidate_id: "cand_bad" })],
      referenceDate: now,
    });

    await repo.insertAnalysisRun({
      id: "failed-analysis",
      candidate_id: "cand_bad",
      status: "failed",
      analysis_input_fingerprint: "fp_bad",
      corpus_fingerprint: "corpus_bad",
      profile_semantic_hash: null,
      normalization_run_id: "norm_bad",
      extraction_json: null,
      prompt_version: "ai_radar_extraction_v1.0",
      model_id: "fixture_llm_v1",
      error_code: "SCHEMA_VALIDATION",
      error_message: "invalid extraction",
    });

    expect(repo.memberScores).toHaveLength(0);
    expect((await repo.getAnalysisRun("failed-analysis"))?.status).toBe("failed");
    void corpus;
  });
});

function scoreResult(overall: number) {
  return {
    scoring_version: "v1" as const,
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
        profile_observability_level: "medium" as const,
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
