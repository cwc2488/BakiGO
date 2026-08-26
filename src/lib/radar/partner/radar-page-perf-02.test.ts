import { describe, expect, it } from "vitest";
import { buildValidExtractionFixture, FIXTURE_NORMALIZED_CONTENT_ID } from "../extraction/test-fixtures";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot } from "../normalization/test-fixtures";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import type { RankedCandidate } from "../scoring/types";
import { loadRadarPartnerFeed } from "./load-radar-partner-feed";
import { buildRadarPartnerCard, type RadarPartnerFeed } from "./radar-partner-presentation";

/**
 * Sequential hydrate mirroring the pre-PERF-02 feed path.
 * Used only to prove logical equivalence of the batched feed.
 */
async function loadRadarPartnerFeedSequentialReference(input: {
  repo: InMemoryRadarRepository;
  member_id: string;
  now: Date;
}): Promise<RadarPartnerFeed> {
  const { resolveDailyPipelineRunDate } = await import("../pipeline/run-date");
  const { parseAllocationRules } = await import("../allocation/allocation-rules");
  const { filterAllocatableForMember, loadMemberDevelopmentProtections } = await import(
    "../allocation/allocation-read-model"
  );
  const { buildRadarPartnerFeed } = await import("./radar-partner-presentation");

  const snapshot_date = resolveDailyPipelineRunDate({ now: input.now });
  const config = await input.repo.getPipelineConfig();
  const rules = parseAllocationRules(config.allocation);
  const protections = await loadMemberDevelopmentProtections({
    repo: input.repo,
    member_id: input.member_id,
    now: input.now,
  });
  const my_development = [];
  for (const protection of protections) {
    const candidate = await input.repo.getCandidate(protection.candidate_id);
    my_development.push({
      candidate_id: protection.candidate_id,
      username: candidate?.normalized_username ?? null,
      protected_until: protection.protected_until,
      protection_expired: protection.protection_expired,
    });
  }

  const snapshot = await input.repo.getMemberDailyTop20(input.member_id, snapshot_date);
  if (!snapshot) {
    return buildRadarPartnerFeed({
      snapshot_date,
      snapshot: null,
      cards: [],
      daily_cap: rules.daily_recommendation_cap,
      my_development,
    });
  }

  const visible = await filterAllocatableForMember({
    repo: input.repo,
    member_id: input.member_id,
    items: snapshot.items,
    now: input.now,
  });
  const scores = await input.repo.listMemberScoreSnapshots({
    member_id: input.member_id,
    snapshot_date,
  });
  const ownFeedback = await input.repo.listMemberRadarRecommendationFeedback({
    member_id: input.member_id,
    recommendation_date: snapshot_date,
  });
  const feedbackByCandidate = new Map(ownFeedback.map((row) => [row.candidate_id, row] as const));
  const cards = [];
  for (const ranked of visible) {
    const score = scores.find((row) => row.candidate_id === ranked.candidateId);
    const analysis = score?.analysis_run_id
      ? await input.repo.getAnalysisRun(score.analysis_run_id)
      : null;
    const corpus = analysis?.normalization_run_id
      ? await input.repo.getNormalizationRun(analysis.normalization_run_id)
      : await input.repo.getLatestNormalizationRun(ranked.candidateId);
    const [candidate, refresh] = await Promise.all([
      input.repo.getCandidate(ranked.candidateId),
      input.repo.getRefreshState(ranked.candidateId),
    ]);
    const card = buildRadarPartnerCard({
      ranked,
      candidate,
      extraction: analysis?.status === "succeeded" ? analysis.extraction_json : null,
      corpus,
      refresh,
      now: input.now,
      source_freshness_window_days: config.source_freshness_window_days,
    });
    cards.push({
      ...card,
      feedback: feedbackByCandidate.get(ranked.candidateId) ?? null,
    });
  }

  return buildRadarPartnerFeed({
    snapshot_date,
    snapshot,
    cards,
    daily_cap: rules.daily_recommendation_cap,
    my_development,
  });
}

function logicalFeedFingerprint(feed: RadarPartnerFeed) {
  return {
    snapshot_date: feed.snapshot_date,
    daily_cap: feed.daily_cap,
    recommendation_count: feed.recommendation_count,
    items: feed.items.map((card) => ({
      candidate_id: card.candidate_id,
      username: card.username,
      score: card.score,
      primary_need: card.primary_need,
      change_signal: card.change_signal,
      why: card.why,
      evidence: card.evidence,
      freshness: card.freshness,
      notices: card.notices,
      feedback: card.feedback
        ? {
            feedback: card.feedback.feedback,
            rejection_reason: card.feedback.rejection_reason,
          }
        : null,
    })),
    my_development: feed.my_development.map((row) => ({
      candidate_id: row.candidate_id,
      username: row.username,
      protected_until: row.protected_until,
      protection_expired: row.protection_expired,
    })),
  };
}

function ranked(candidateId: string, score: number, rank: number): RankedCandidate {
  return {
    candidateId,
    overall_score: score,
    display_overall_score: score,
    rank,
    result: {
      scoring_version: "v1",
      overall_score: score,
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
          analyzable_item_count: 1,
          excluded_repost_count: 0,
          excluded_duplicate_count: 0,
          excluded_empty_share_count: 0,
          excluded_no_expression_count: 0,
          excluded_unattributable_count: 0,
        },
        trait_observability: [],
      },
      needs: [],
    },
  };
}

describe("RADAR-PAGE-PERF-02 feed logical equivalence", () => {
  it("batched feed matches sequential reference for ids, order, scores, why, evidence, feedback", async () => {
    const now = new Date("2026-08-26T04:00:00.000Z");
    const memberId = "11111111-1111-4111-8111-111111111111";
    const repo = new InMemoryRadarRepository();
    const snapshotDate = "2026-08-26";

    const items: RankedCandidate[] = [];
    for (let i = 0; i < 5; i += 1) {
      const candidateId = `cand_perf_${i}`;
      const username = `user_perf_${i}`;
      await repo.upsertCandidate({
        id: candidateId,
        display_name: username,
        primary_platform: "threads",
        normalized_username: username,
        acquisition_source: "system_discovery",
      });
      const corpus = normalizeCandidateContent({
        candidate_id: candidateId,
        normalization_run_id: `norm_perf_${i}`,
        snapshots: [
          buildRawSnapshot({
            candidate_id: candidateId,
            external_content_id: `post_${i}`,
            payload: {
              published_at: "2026-08-20T09:30:00.000Z",
              content_type: "text_post",
              content_relationship: "original",
              text: `想改善體態 ${i}`,
              is_authored_by_candidate: true,
              permalink: `https://www.threads.net/@${username}/post/${i}`,
            },
          }),
        ],
      });
      await repo.persistNormalizationRun(corpus);
      const analyzableId =
        corpus.items.find((row) => row.is_analyzable)?.normalized_content_id ??
        FIXTURE_NORMALIZED_CONTENT_ID;
      const extraction = buildValidExtractionFixture({
        candidate_id: candidateId,
        change_window: {
          change_intent: {
            availability: "available",
            level: "strong",
            source_refs: [{ content_id: analyzableId, platform: "threads" }],
            reasoning: "近期反覆表達具體改變意圖。",
          },
          behavioral_change: {
            availability: "available",
            level: "trying",
            source_refs: [{ content_id: analyzableId, platform: "threads" }],
            reasoning: "已開始實際嘗試。",
          },
          solution_gap: {
            availability: "available",
            level: "active_gap",
            source_refs: [{ content_id: analyzableId, platform: "threads" }],
            reasoning: "仍在尋找新解法。",
          },
        },
        needs: {
          availability: "available",
          items: [
            {
              need_id: "body_composition",
              need_type: "body_composition_change",
              strength: "strong",
              relevance: "high_fit",
              source_refs: [{ content_id: analyzableId, platform: "threads" }],
              reasoning: "明確想改善體態。",
            },
          ],
          reasoning: "偵測到一項主要需求。",
        },
        candidate_understanding: {
          need_owner: "self",
          need_state: "unresolved",
          market_role: "consumer",
          need_category: "fat_loss",
          pain_points: ["體態"],
          attempts: [],
          unresolved_gap: "還在卡關",
          urgency: "medium",
          help_seeking: "implicit",
          evidence_confidence: 0.8,
          primary_language: "zh-Hant",
          traditional_chinese_usable: "true",
          recommendation_reason_zh: `想改善體態 ${i}`,
          region_label: null,
          region_confidence: "unknown",
        },
      });
      const analysisId = `11111111-1111-4111-8111-11111111111${i}`;
      await repo.insertAnalysisRun({
        id: analysisId,
        candidate_id: candidateId,
        status: "succeeded",
        analysis_input_fingerprint: `fp_${i}`,
        corpus_fingerprint: corpus.normalization_run_id,
        profile_semantic_hash: null,
        normalization_run_id: corpus.normalization_run_id,
        extraction_json: extraction,
        prompt_version: "ai_radar_extraction_v1.2",
        model_id: "gpt-4.1-mini",
      });
      repo.refreshState.set(candidateId, {
        candidate_id: candidateId,
        refresh_tier: "standard",
        last_source_check_at: now.toISOString(),
        last_enrich_succeeded_at: now.toISOString(),
        last_normalization_succeeded_at: now.toISOString(),
        source_freshness_valid_until: null,
        corpus_fingerprint: corpus.normalization_run_id,
        profile_semantic_hash: null,
        data_completeness: "full",
        enrichment_capability_state: null,
        current_analysis_run_id: analysisId,
        validated_extraction_fingerprint: null,
        force_reanalysis: false,
      });
      await repo.insertMemberScoreSnapshot({
        id: `score_${i}`,
        member_id: memberId,
        candidate_id: candidateId,
        analysis_run_id: analysisId,
        baseline_score_snapshot_id: null,
        overall_score: 70 - i,
        component_scores: {},
        snapshot_date: snapshotDate,
        location_level: null,
        result: ranked(candidateId, 70 - i, i + 1).result,
      });
      items.push(ranked(candidateId, 70 - i, i + 1));
    }

    await repo.setMemberCandidateState({
      member_id: memberId,
      candidate_id: "cand_perf_4",
      development_state: "already_known",
      excluded_from_recommendations: true,
      exclusion_reason_code: "already_known",
      skip_expires_at: null,
    });

    await repo.upsertMemberRadarRecommendationFeedback({
      id: "fb_1",
      member_id: memberId,
      candidate_id: "cand_perf_0",
      recommendation_date: snapshotDate,
      feedback: "worth_developing",
      rejection_reason: null,
      optional_note: null,
      evaluation_context: {
        pipeline_run_id: null,
        overall_score: 70,
        recommendation_reason_shown: "想改善體態 0",
        prompt_version: "ai_radar_extraction_v1.2",
        semantic_version: "v1.2",
        need_owner: "self",
        need_state: "unresolved",
        market_role: "consumer",
        need_category: "fat_loss",
        urgency: "medium",
        help_seeking: "implicit",
        primary_language: "zh-Hant",
        candidate_region: null,
        location_level: null,
      },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    await repo.upsertCandidate({
      id: "cand_dev_1",
      display_name: "dev_user",
      primary_platform: "threads",
      normalized_username: "dev_user",
      acquisition_source: "system_discovery",
    });
    await repo.setMemberCandidateState({
      member_id: memberId,
      candidate_id: "cand_dev_1",
      development_state: "in_progress",
      excluded_from_recommendations: false,
      exclusion_reason_code: null,
      skip_expires_at: null,
    });
    repo.candidateClaims.set("cand_dev_1", {
      candidate_id: "cand_dev_1",
      member_id: memberId,
      claimed_at: "2026-08-01T00:00:00.000Z",
      expires_at: "2026-10-30T00:00:00.000Z",
      allocatable_at: "2026-11-01T00:00:00.000Z",
      released_at: null,
      release_reason: null,
    });

    await repo.upsertMemberDailyTop20({
      member_id: memberId,
      pipeline_run_id: "run_perf",
      snapshot_date: snapshotDate,
      generated_at: now,
      items,
    });

    const [batched, sequential] = await Promise.all([
      loadRadarPartnerFeed({ repo, member_id: memberId, now }),
      loadRadarPartnerFeedSequentialReference({ repo, member_id: memberId, now }),
    ]);

    expect(logicalFeedFingerprint(batched)).toEqual(logicalFeedFingerprint(sequential));
    expect(batched.items.map((c) => c.candidate_id)).toEqual([
      "cand_perf_0",
      "cand_perf_1",
      "cand_perf_2",
      "cand_perf_3",
    ]);
    expect(batched.items[0]?.feedback?.feedback).toBe("worth_developing");
    expect(batched.my_development.map((d) => d.candidate_id)).toEqual(["cand_dev_1"]);
  });
});
