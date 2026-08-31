import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AI_RADAR_PROMPT_VERSION } from "../ai/prompt";
import { applyRadarPartnerAction } from "../partner/apply-radar-partner-action";
import { loadRadarPartnerFeed } from "../partner/load-radar-partner-feed";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import type { RankedCandidate } from "../scoring/types";
import { buildRadarFeedbackEvaluationContext } from "./evaluation-context";
import { upsertRadarFeedback } from "./upsert-radar-feedback";
import type { RadarFeedbackEvaluationContext } from "./types";

const now = new Date("2026-08-24T04:00:00.000Z");
const memberA = "11111111-1111-4111-8111-111111111111";
const memberB = "22222222-2222-4222-8222-222222222222";
const candidateId = "cand_threads_feedback_demo";

function ranked(candidateId: string, score: number): RankedCandidate {
  return {
    candidateId,
    overall_score: score,
    display_overall_score: score,
    rank: 1,
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

async function seedMemberDay(repo: InMemoryRadarRepository, member_id: string) {
  await repo.upsertCandidate({
    id: candidateId,
    normalized_username: "feedback.demo",
    primary_platform: "threads",
  });
  const analysis_run_id = randomUUID();
  repo.analysisRuns.set(analysis_run_id, {
    id: analysis_run_id,
    candidate_id: candidateId,
    status: "succeeded",
    analysis_input_fingerprint: "fp",
    corpus_fingerprint: "cfp",
    profile_semantic_hash: null,
    normalization_run_id: randomUUID(),
    extraction_json: {
      schema_version: "ai_radar_extraction_v1",
      scoring_version: "scoring_v1",
      fit_policy_id: "fit_policy_v1",
      analysis_run_id,
      candidate_id: candidateId,
      analyzed_at: now.toISOString(),
      model_id: "test",
      prompt_version: AI_RADAR_PROMPT_VERSION,
      change_window: {
        change_intent: {
          availability: "available",
          level: "clear",
          source_refs: [{ platform: "threads", content_id: "p1" }],
          reasoning: "本人最近想減脂",
        },
        behavioral_change: { availability: "unknown", reasoning: "n/a" },
        solution_gap: { availability: "unknown", reasoning: "n/a" },
      },
      needs: { availability: "unknown", reasoning: "n/a" },
      contactability: {
        natural_entry: { availability: "unknown", reasoning: "n/a" },
        interaction_openness: { availability: "unknown", reasoning: "n/a" },
      },
      location: { availability: "unknown", reasoning: "n/a" },
      core_traits: [],
      advisory: { recommendation_reasons: ["本人有清楚的減脂意圖"] },
      candidate_understanding: {
        need_owner: "self",
        need_state: "unresolved",
        market_role: "consumer",
        need_category: "fat_loss",
        pain_points: ["卡關"],
        attempts: [],
        unresolved_gap: "還沒找到方法",
        urgency: "medium",
        help_seeking: "implicit",
        evidence_confidence: 0.8,
        primary_language: "zh-Hant",
        traditional_chinese_usable: "true",
        candidate_region: { city: "台北市", district: "大安區" },
        region_confidence: "medium",
        region_evidence: null,
        recommendation_reason_zh: "近期多次表達減脂困擾，屬於本人尚未解決的需求。",
      },
    } as never,
    prompt_version: AI_RADAR_PROMPT_VERSION,
    model_id: "test",
    error_code: null,
    error_message: null,
    created_at: now.toISOString(),
  });
  await repo.insertMemberScoreSnapshot({
    id: randomUUID(),
    member_id,
    candidate_id: candidateId,
    analysis_run_id,
    baseline_score_snapshot_id: randomUUID(),
    overall_score: 71,
    component_scores: {},
    location_level: "same_district",
    snapshot_date: "2026-08-24",
    result: ranked(candidateId, 71).result,
  });
  await repo.upsertMemberDailyTop20({
    member_id,
    pipeline_run_id: "run-feedback-1",
    snapshot_date: "2026-08-24",
    generated_at: now,
    items: [ranked(candidateId, 71)],
  });
}

describe("RADAR-FEEDBACK-01", () => {
  it("persists 👍 worth_developing immediately", async () => {
    const repo = new InMemoryRadarRepository();
    await seedMemberDay(repo, memberA);
    const result = await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "worth_developing",
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feedback.feedback).toBe("worth_developing");
    expect(result.feedback.rejection_reason).toBeNull();
    expect(result.today_snapshot_unchanged).toBe(true);
  });

  it("persists 👎 with a rejection reason", async () => {
    const repo = new InMemoryRadarRepository();
    await seedMemberDay(repo, memberA);
    const result = await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "not_worth_developing",
      rejection_reason: "not_self_need",
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feedback.feedback).toBe("not_worth_developing");
    expect(result.feedback.rejection_reason).toBe("not_self_need");
    expect(result.feedback.optional_note).toBeNull();
  });

  it("allows optional note only for 其他", async () => {
    const repo = new InMemoryRadarRepository();
    await seedMemberDay(repo, memberA);
    const withNote = await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "not_worth_developing",
      rejection_reason: "other",
      optional_note: "看起來像廣告",
      now,
    });
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) return;
    expect(withNote.feedback.optional_note).toBe("看起來像廣告");

    const withoutNote = await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "not_worth_developing",
      rejection_reason: "other",
      optional_note: null,
      now,
    });
    expect(withoutNote.ok).toBe(true);
    if (!withoutNote.ok) return;
    expect(withoutNote.feedback.optional_note).toBeNull();
  });

  it("lets a member correct their evaluation", async () => {
    const repo = new InMemoryRadarRepository();
    await seedMemberDay(repo, memberA);
    await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "worth_developing",
      now,
    });
    const corrected = await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "not_worth_developing",
      rejection_reason: "ai_misunderstood",
      now,
    });
    expect(corrected.ok).toBe(true);
    const rows = await repo.listMemberRadarRecommendationFeedback({
      member_id: memberA,
      recommendation_date: "2026-08-24",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.feedback).toBe("not_worth_developing");
    expect(rows[0]?.rejection_reason).toBe("ai_misunderstood");
  });

  it("allows different members to evaluate the same candidate differently", async () => {
    const repo = new InMemoryRadarRepository();
    await seedMemberDay(repo, memberA);
    await seedMemberDay(repo, memberB);
    await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "worth_developing",
      now,
    });
    await upsertRadarFeedback({
      repo,
      member_id: memberB,
      candidate_id: candidateId,
      feedback: "not_worth_developing",
      rejection_reason: "peer_provider",
      now,
    });
    const a = await repo.getMemberRadarRecommendationFeedback({
      member_id: memberA,
      candidate_id: candidateId,
      recommendation_date: "2026-08-24",
    });
    const b = await repo.getMemberRadarRecommendationFeedback({
      member_id: memberB,
      candidate_id: candidateId,
      recommendation_date: "2026-08-24",
    });
    expect(a?.feedback).toBe("worth_developing");
    expect(b?.feedback).toBe("not_worth_developing");
  });

  it("does not let member B mutate member A's feedback row", async () => {
    const repo = new InMemoryRadarRepository();
    await seedMemberDay(repo, memberA);
    await seedMemberDay(repo, memberB);
    await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "worth_developing",
      now,
    });
    await upsertRadarFeedback({
      repo,
      member_id: memberB,
      candidate_id: candidateId,
      feedback: "not_worth_developing",
      rejection_reason: "language_region_unfit",
      now,
    });
    const a = await repo.getMemberRadarRecommendationFeedback({
      member_id: memberA,
      candidate_id: candidateId,
      recommendation_date: "2026-08-24",
    });
    expect(a?.feedback).toBe("worth_developing");
    expect(a?.member_id).toBe(memberA);
  });

  it("preserves recommendation-time context and keeps it immutable after reanalyze", async () => {
    const repo = new InMemoryRadarRepository();
    await seedMemberDay(repo, memberA);
    const first = await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "worth_developing",
      now,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const frozen = structuredClone(first.feedback.evaluation_context) as RadarFeedbackEvaluationContext;
    expect(frozen.prompt_version).toBe(AI_RADAR_PROMPT_VERSION);
    expect(frozen.need_owner).toBe("self");
    expect(frozen.overall_score).toBe(71);
    expect(frozen.recommendation_reason_shown).toContain("減脂");

    const analysisId = (await repo.listMemberScoreSnapshots({
      member_id: memberA,
      snapshot_date: "2026-08-24",
    }))[0]?.analysis_run_id;
    const analysis = analysisId ? await repo.getAnalysisRun(analysisId) : null;
    if (analysis?.extraction_json?.candidate_understanding) {
      analysis.extraction_json.candidate_understanding.need_owner = "third_party";
      analysis.prompt_version = "ai_radar_extraction_v9.9";
      repo.analysisRuns.set(analysis.id, analysis);
    }

    const corrected = await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "not_worth_developing",
      rejection_reason: "ai_misunderstood",
      now,
    });
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;
    expect(corrected.feedback.evaluation_context).toEqual(frozen);
    expect(corrected.feedback.evaluation_context.need_owner).toBe("self");
    expect(corrected.feedback.evaluation_context.prompt_version).toBe(AI_RADAR_PROMPT_VERSION);
  });

  it("does not change candidate score, Top20, or global exclusion", async () => {
    const repo = new InMemoryRadarRepository();
    await seedMemberDay(repo, memberA);
    const before = await repo.getMemberDailyTop20(memberA, "2026-08-24");
    const beforeScores = await repo.listMemberScoreSnapshots({
      member_id: memberA,
      snapshot_date: "2026-08-24",
    });
    await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "not_worth_developing",
      rejection_reason: "already_resolved",
      now,
    });
    const after = await repo.getMemberDailyTop20(memberA, "2026-08-24");
    const afterScores = await repo.listMemberScoreSnapshots({
      member_id: memberA,
      snapshot_date: "2026-08-24",
    });
    expect(after).toEqual(before);
    expect(afterScores[0]?.overall_score).toBe(beforeScores[0]?.overall_score);
    const state = await repo.getMemberCandidateState(memberA, candidateId);
    expect(state).toBeNull();
    const feed = await loadRadarPartnerFeed({ repo, member_id: memberA, now });
    expect(feed.recommendation_count).toBe(1);
    expect(feed.items[0]?.feedback?.feedback).toBe("not_worth_developing");
  });

  it("keeps 開始開發 and the feed working after feedback", async () => {
    const repo = new InMemoryRadarRepository();
    await seedMemberDay(repo, memberA);
    await upsertRadarFeedback({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      feedback: "worth_developing",
      now,
    });
    const start = await applyRadarPartnerAction({
      repo,
      member_id: memberA,
      candidate_id: candidateId,
      action: "start",
      now,
    });
    expect(start.ok).toBe(true);
    const feed = await loadRadarPartnerFeed({ repo, member_id: memberA, now });
    expect(feed.empty_reason).toBe("all_handled");
    expect(feed.my_development).toHaveLength(1);
  });

  it("builds evaluation context suitable for future quality reports", () => {
    const context = buildRadarFeedbackEvaluationContext({
      pipeline_run_id: "run-1",
      overall_score: 55,
      recommendation_reason_shown: "本人尚未解決",
      prompt_version: AI_RADAR_PROMPT_VERSION,
      location_level: "same_city",
      extraction: {
        candidate_understanding: {
          need_owner: "self",
          need_state: "unresolved",
          market_role: "consumer",
          need_category: "fat_loss",
          urgency: "high",
          help_seeking: "explicit",
          primary_language: "zh-Hant",
          candidate_region: { city: "台中市", district: null },
        },
      } as never,
    });
    expect(context.semantic_version).toBe("RADAR-SEMANTIC-V1.3");
    expect(context.need_owner).toBe("self");
    expect(context.primary_language).toBe("zh-Hant");
    expect(context.candidate_region?.city).toBe("台中市");
  });
});
