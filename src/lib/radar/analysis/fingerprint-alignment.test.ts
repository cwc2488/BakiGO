import { describe, expect, it } from "vitest";
import {
  buildAnalyzeFingerprints,
  decideAnalyzeCandidate,
} from "../ai/analyze-candidate";
import { AI_RADAR_MODEL_ID, AI_RADAR_PROMPT_VERSION } from "../ai/prompt";
import { runRankWorker } from "../jobs/workers/rank-worker";
import type { RadarJobRecord } from "../jobs/types";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../jobs/queue";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot, REFERENCE_DATE } from "../normalization/test-fixtures";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import { createSourceAdapterRegistry } from "../sources/registry";
import type { OverallScoreResult } from "../scoring/types";
import {
  buildCanonicalFingerprints,
  computeCorpusFingerprint,
  qualifiesForTop20Analysis,
} from "./fingerprint";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const CANDIDATE_ID = "cand_8f2a91";
const PROFILE_HASH = "profile_semantic_v1";

function corpus(text?: string) {
  return normalizeCandidateContent({
    candidate_id: CANDIDATE_ID,
    normalization_run_id: `norm_${CANDIDATE_ID}_${text ? "changed" : "base"}`,
    snapshots: [
      buildRawSnapshot({
        external_content_id: "th_align_1",
        ...(text
          ? {
              payload: {
                published_at: "2026-08-08T09:30:00.000Z",
                content_type: "text_post" as const,
                content_relationship: "original" as const,
                text,
                is_authored_by_candidate: true,
              },
            }
          : {}),
      }),
    ],
    referenceDate: REFERENCE_DATE,
  });
}

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

function rankJob(): RadarJobRecord {
  return {
    id: "rank-align-1",
    pipeline_run_id: null,
    job_type: "rank",
    idempotency_key: "k",
    status: "running",
    payload: { run_date: "2026-08-23", member_id: "member-1", artifact_refs: {} },
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
}

describe("RADAR-SUPPLY-02 fingerprint alignment", () => {
  it("A: normalize and analyze fingerprints match for identical evidence", () => {
    const shared = corpus();
    const normalizeFp = buildCanonicalFingerprints({
      corpus: shared,
      profile_semantic_hash: PROFILE_HASH,
      prompt_version: AI_RADAR_PROMPT_VERSION,
      model_id: AI_RADAR_MODEL_ID,
    });
    const analyzeFp = buildAnalyzeFingerprints(shared, PROFILE_HASH);

    expect(normalizeFp.corpus_fingerprint).toBe(analyzeFp.corpus_fingerprint);
    expect(normalizeFp.analysis_input_fingerprint).toBe(analyzeFp.analysis_input_fingerprint);
    expect(
      computeCorpusFingerprint({
        analyzable_content: shared.items
          .filter((item) => item.is_analyzable)
          .map((item) => ({
            normalized_content_id: item.normalized_content_id,
            content_hash: item.content_hash,
          })),
        profile_semantic_hash: null,
      }),
    ).not.toBe(normalizeFp.corpus_fingerprint);
  });

  it("B: unchanged candidate + cached analysis stays rank eligible", async () => {
    const repo = new InMemoryRadarRepository();
    const shared = corpus();
    await repo.upsertCandidate({
      id: CANDIDATE_ID,
      display_name: "aligned",
      profile_semantic_hash: PROFILE_HASH,
    });
    const fingerprints = buildAnalyzeFingerprints(shared, PROFILE_HASH);
    await repo.insertAnalysisRun({
      id: "33333333-3333-4333-8333-333333333333",
      candidate_id: CANDIDATE_ID,
      status: "succeeded",
      analysis_input_fingerprint: fingerprints.analysis_input_fingerprint,
      corpus_fingerprint: fingerprints.corpus_fingerprint,
      profile_semantic_hash: PROFILE_HASH,
      normalization_run_id: shared.normalization_run_id,
      extraction_json: { candidate_id: CANDIDATE_ID } as never,
      prompt_version: AI_RADAR_PROMPT_VERSION,
      model_id: AI_RADAR_MODEL_ID,
    });

    const decision = await decideAnalyzeCandidate(repo, shared);
    expect(decision.reanalyze).toBe(false);
    expect(decision.cached_analysis_run_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(decision.corpus_fingerprint).toBe(fingerprints.corpus_fingerprint);

    await repo.updateRefreshStateAfterNormalize({
      candidate_id: CANDIDATE_ID,
      corpus_fingerprint: decision.corpus_fingerprint,
      profile_semantic_hash: PROFILE_HASH,
      data_completeness: shared.data_completeness,
      current_analysis_run_id: decision.cached_analysis_run_id,
      validated_extraction_fingerprint: decision.analysis_input_fingerprint,
      now: NOW,
    });
    await repo.updateRefreshStateAfterEnrich({
      candidate_id: CANDIDATE_ID,
      succeeded: true,
      now: NOW,
    });

    const refresh = await repo.getRefreshState(CANDIDATE_ID);
    const analysis = await repo.getAnalysisRun("33333333-3333-4333-8333-333333333333");
    expect(
      qualifiesForTop20Analysis({
        source_fresh: true,
        corpus_fingerprint: refresh?.corpus_fingerprint ?? null,
        analysis_corpus_fingerprint: analysis?.corpus_fingerprint ?? null,
        validated_extraction_fingerprint: refresh?.validated_extraction_fingerprint ?? null,
        analysis_input_fingerprint: analysis?.analysis_input_fingerprint ?? null,
        has_validated_extraction: true,
      }),
    ).toBe(true);

    await repo.insertMemberScoreSnapshot({
      id: "score_aligned",
      member_id: "member-1",
      candidate_id: CANDIDATE_ID,
      analysis_run_id: "33333333-3333-4333-8333-333333333333",
      baseline_score_snapshot_id: "b1",
      overall_score: 41.3,
      component_scores: {},
      location_level: "unknown",
      snapshot_date: "2026-08-23",
      result: scoreResult(41.3),
    });

    const ranked = await runRankWorker(
      {
        repo,
        queue: new RadarJobQueue(new InMemoryRadarJobQueueStore()),
        sources: createSourceAdapterRegistry(),
        now: NOW,
      },
      rankJob(),
    );
    expect(ranked.metrics?.skipped_freshness_or_analysis).toBe(0);
    const top20 = await repo.getMemberDailyTop20("member-1", "2026-08-23");
    expect(top20?.items).toHaveLength(1);
    expect(top20?.items[0]?.candidateId).toBe(CANDIDATE_ID);
  });

  it("C: changed evidence changes the fingerprint and stale analysis is not rank eligible", async () => {
    const repo = new InMemoryRadarRepository();
    const original = corpus();
    const changed = corpus("全新貼文，內容已實質改變，必須重跑分析。");
    await repo.upsertCandidate({
      id: CANDIDATE_ID,
      display_name: "changed",
      profile_semantic_hash: PROFILE_HASH,
    });
    const stale = buildAnalyzeFingerprints(original, PROFILE_HASH);
    const next = buildAnalyzeFingerprints(changed, PROFILE_HASH);
    expect(next.corpus_fingerprint).not.toBe(stale.corpus_fingerprint);

    await repo.insertAnalysisRun({
      id: "44444444-4444-4444-8444-444444444444",
      candidate_id: CANDIDATE_ID,
      status: "succeeded",
      analysis_input_fingerprint: stale.analysis_input_fingerprint,
      corpus_fingerprint: stale.corpus_fingerprint,
      profile_semantic_hash: PROFILE_HASH,
      normalization_run_id: original.normalization_run_id,
      extraction_json: { candidate_id: CANDIDATE_ID } as never,
      prompt_version: AI_RADAR_PROMPT_VERSION,
      model_id: AI_RADAR_MODEL_ID,
    });

    const decision = await decideAnalyzeCandidate(repo, changed);
    expect(decision.cached_analysis_run_id).toBeNull();
    expect(decision.corpus_fingerprint).toBe(next.corpus_fingerprint);

    await repo.updateRefreshStateAfterNormalize({
      candidate_id: CANDIDATE_ID,
      corpus_fingerprint: next.corpus_fingerprint,
      profile_semantic_hash: PROFILE_HASH,
      data_completeness: changed.data_completeness,
      now: NOW,
    });
    await repo.updateRefreshStateAfterEnrich({
      candidate_id: CANDIDATE_ID,
      succeeded: true,
      now: NOW,
    });

    const refresh = await repo.getRefreshState(CANDIDATE_ID);
    const analysis = await repo.getAnalysisRun("44444444-4444-4444-8444-444444444444");
    expect(
      qualifiesForTop20Analysis({
        source_fresh: true,
        corpus_fingerprint: refresh?.corpus_fingerprint ?? null,
        analysis_corpus_fingerprint: analysis?.corpus_fingerprint ?? null,
        validated_extraction_fingerprint: stale.analysis_input_fingerprint,
        analysis_input_fingerprint: analysis?.analysis_input_fingerprint ?? null,
        has_validated_extraction: true,
      }),
    ).toBe(false);

    await repo.insertMemberScoreSnapshot({
      id: "score_stale",
      member_id: "member-1",
      candidate_id: CANDIDATE_ID,
      analysis_run_id: "44444444-4444-4444-8444-444444444444",
      baseline_score_snapshot_id: "b2",
      overall_score: 80,
      component_scores: {},
      location_level: "unknown",
      snapshot_date: "2026-08-23",
      result: scoreResult(80),
    });

    const ranked = await runRankWorker(
      {
        repo,
        queue: new RadarJobQueue(new InMemoryRadarJobQueueStore()),
        sources: createSourceAdapterRegistry(),
        now: NOW,
      },
      rankJob(),
    );
    expect(ranked.metrics?.skipped_freshness_or_analysis).toBe(1);
    const top20 = await repo.getMemberDailyTop20("member-1", "2026-08-23");
    expect(top20?.items ?? []).toHaveLength(0);
  });
});
