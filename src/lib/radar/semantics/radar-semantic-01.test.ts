import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildValidExtractionFixture } from "../extraction/test-fixtures";
import { resolveLocationLevel } from "../extraction/resolve-location";
import { applyExtractionConformance } from "../extraction/extraction-conformance";
import { validateAiRadarExtraction } from "../extraction/validate-ai-radar-extraction";
import { buildLanguageSkipExtraction } from "./language-skip-extraction";
import { runRankWorker } from "../jobs/workers/rank-worker";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../jobs/queue";
import type { RadarJobRecord } from "../jobs/types";
import { buildRadarPartnerCard } from "../partner/radar-partner-presentation";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import { createSourceAdapterRegistry } from "../sources/registry";
import type { OverallScoreResult } from "../scoring/types";
import { LOCATION_POINTS } from "../scoring/config";
import {
  emptyUnderstanding,
  evaluateSemanticEligibility,
  type CandidateUnderstanding,
} from "./candidate-understanding";
import { classifyTextLanguage, shouldSkipExpensiveAnalysis } from "./language-eligibility";
import { buildRecommendationReasonZh, pickPartnerWhyLines } from "./recommendation-reason";
import {
  nextTaipeiCalendarDate,
  planRegionChange,
  resolveEffectiveRadarRegion,
  taipeiCalendarDate,
} from "./region-preference";

function understanding(overrides: Partial<CandidateUnderstanding>): CandidateUnderstanding {
  return emptyUnderstanding({
    need_owner: "self",
    need_state: "unresolved",
    market_role: "consumer",
    need_category: "fat_loss",
    evidence_confidence: 0.8,
    primary_language: "zh-Hant",
    traditional_chinese_usable: "true",
    ...overrides,
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

describe("RADAR-SEMANTIC-01", () => {
  it("1. self unresolved Traditional Chinese is eligible", () => {
    const text = "最近胖了很多，飲控也瘦不下來。";
    const language = classifyTextLanguage(text);
    expect(language.primary_language).toBe("zh-Hant");
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "unresolved",
        pain_points: ["最近胖了很多"],
        unresolved_gap: "飲控也瘦不下來",
        primary_language: language.primary_language,
        traditional_chinese_usable: language.traditional_chinese_usable,
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("self_unresolved_need");
  });

  it("2. in_progress_with_gap stays eligible", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_state: "in_progress_with_gap",
        attempts: ["健身三個月"],
        unresolved_gap: "體重卡兩個月沒動",
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("self_in_progress_with_gap");
  });

  it("3. resolved success is not a strong current need", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_state: "resolved",
        unresolved_gap: null,
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("resolved_success");
  });

  it("4. student result is provider/third-party, not personal need", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "third_party",
        market_role: "provider",
        need_state: "resolved",
      }),
    );
    expect(result.eligible).toBe(false);
    expect(["third_party_need", "resolved_success", "provider_without_self_need"]).toContain(
      result.reason,
    );
  });

  it("5. celebrity exercise/singing is third_party", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "third_party",
        need_state: "none",
        market_role: "unknown",
        need_category: "other",
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("third_party_need");
  });

  it("6. fitness educator generic nutrition is provider/general", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "general",
        need_state: "none",
        market_role: "provider",
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.personal_need).toBe(false);
  });

  it("7. coach with self unresolved need remains valid", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "unresolved",
        market_role: "mixed",
        pain_points: ["自己最近胖8公斤"],
        unresolved_gap: "怎麼減都減不掉",
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.personal_need).toBe(true);
  });

  it("8. Korean recent corpus is language-ineligible", () => {
    const language = classifyTextLanguage(
      "오늘의 러닝: 6K 이번달 누적 러닝: 159. 매일 아침 달리기를 하고 체중 관리를 하고 있어요.",
    );
    expect(language.primary_language).toBe("ko");
    expect(shouldSkipExpensiveAnalysis(language)).toBe(true);
    expect(
      evaluateSemanticEligibility(understanding({ primary_language: "ko", traditional_chinese_usable: "false" }))
        .eligible,
    ).toBe(false);
  });

  it("9. Japanese recent corpus is language-ineligible", () => {
    const language = classifyTextLanguage(
      "食事で除脂肪、運動で理想の身体を設計し体重−12kg成功。仕事は回せるのに自分の体型だけ管理できていなかった。",
    );
    expect(language.primary_language).toBe("ja");
    expect(shouldSkipExpensiveAnalysis(language)).toBe(true);
  });

  it("10. Traditional Chinese with an occasional Japanese phrase stays eligible", () => {
    const language = classifyTextLanguage(
      "最近真的胖很多，飲控也瘦不下來。今晚想吃拉麵，先去跑步再決定。偶爾寫一句ありがとう也不影響。",
    );
    expect(language.primary_language).toBe("zh-Hant");
    expect(language.traditional_chinese_usable).toBe("true");
  });

  it("11. mixed account with substantial Traditional Chinese is eligible", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        primary_language: "mixed",
        traditional_chinese_usable: "true",
      }),
    );
    expect(result.language_eligible).toBe(true);
    expect(result.eligible).toBe(true);
  });

  it("12. English-only account is ineligible in V1", () => {
    const language = classifyTextLanguage(
      "I have been training every day and still cannot lose the last ten pounds. Protein intake is important when training.",
    );
    expect(language.primary_language).toBe("en");
    expect(
      evaluateSemanticEligibility(
        understanding({ primary_language: "en", traditional_chinese_usable: "false" }),
      ).reason,
    ).toBe("language_ineligible");
  });

  it("13. unknown language is not confidently eligible", () => {
    expect(
      evaluateSemanticEligibility(
        understanding({ primary_language: "unknown", traditional_chinese_usable: "uncertain" }),
      ).reason,
    ).toBe("language_unknown");
  });

  it("14. same qualified candidate near preferred region gets proximity boost", () => {
    const location = {
      availability: "available" as const,
      normalized_city: "新北市",
      normalized_district: "板橋區",
      source_refs: [{ platform: "threads" as const, content_id: "norm_1" }],
      reasoning: "公開標示板橋",
    };
    const near = resolveLocationLevel(location, {
      primary_city: "新北市",
      primary_district: "板橋區",
    });
    const far = resolveLocationLevel(location, {
      primary_city: "台中市",
      primary_district: "西屯區",
    });
    expect(near).toBe("same_district");
    expect(far).toBe("far");
    expect(LOCATION_POINTS[near]).toBeGreaterThan(LOCATION_POINTS[far]);
  });

  it("15. unknown candidate location stays eligible with no proximity boost", () => {
    const result = evaluateSemanticEligibility(understanding({ region_confidence: "unknown" }));
    expect(result.eligible).toBe(true);
    const level = resolveLocationLevel(
      { availability: "unknown", reasoning: "no public region" },
      { primary_city: "台北市", primary_district: "大安區" },
    );
    expect(level).toBe("unknown");
    expect(LOCATION_POINTS.unknown).toBe(0);
  });

  it("16. changing region today does not mutate current effective region", () => {
    const now = new Date("2026-08-24T04:00:00.000Z");
    const existing = planRegionChange({
      existing: null,
      member_id: "m1",
      city: "新北市",
      district: "板橋區",
      now,
    });
    const changed = planRegionChange({
      existing,
      member_id: "m1",
      city: "台中市",
      district: "西屯區",
      now,
    });
    const today = taipeiCalendarDate(now);
    const effectiveToday = resolveEffectiveRadarRegion(changed, today);
    expect(effectiveToday.city).toBe("新北市");
    expect(effectiveToday.district).toBe("板橋區");
    expect(changed.pending_city).toBe("台中市");
  });

  it("17. next Asia/Taipei day applies the pending region", () => {
    const now = new Date("2026-08-24T04:00:00.000Z");
    const existing = planRegionChange({
      existing: null,
      member_id: "m1",
      city: "新北市",
      district: "板橋區",
      now,
    });
    const changed = planRegionChange({
      existing,
      member_id: "m1",
      city: "台中市",
      district: "西屯區",
      now,
    });
    const tomorrow = nextTaipeiCalendarDate(now);
    expect(changed.pending_effective_date).toBe(tomorrow);
    const nextDay = resolveEffectiveRadarRegion(changed, tomorrow);
    expect(nextDay.city).toBe("台中市");
    expect(nextDay.district).toBe("西屯區");
    expect(nextDay.source).toBe("pending");
  });

  it("18. recommendation reason is Traditional Chinese", () => {
    const reason = buildRecommendationReasonZh(
      understanding({
        need_state: "in_progress_with_gap",
        attempts: ["飲食控制", "運動"],
        unresolved_gap: "體重仍停滯",
        pain_points: ["挫折"],
      }),
    );
    expect(reason).toMatch(/[\u4E00-\u9FFF]/);
    expect(reason).toContain("尚未解決");
    expect(reason).not.toMatch(/Candidate mentions/i);
  });

  it("19. third-party evidence cannot become the personal reason", () => {
    const lines = pickPartnerWhyLines({
      need_owner: "third_party",
      recommendation_reason_zh: "我的學生三個月瘦10公斤。",
      fallback_reasons: ["Candidate mentions a celebrity exercise routine and singing performance."],
    });
    expect(lines).toEqual([]);
  });

  it("20. only 8 genuinely qualified candidates stay 8 — no fabricated 20", async () => {
    const repo = new InMemoryRadarRepository();
    const now = new Date("2026-08-24T08:00:00.000Z");
    const member_id = "member-semantic";
    repo.members = [{ member_id }];

    for (let index = 0; index < 20; index += 1) {
      const candidate_id = `cand_${index}`;
      const qualified = index < 8;
      await repo.upsertCandidate({ id: candidate_id, display_name: candidate_id });
      const analysis_run_id = randomUUID();
      const extraction = buildValidExtractionFixture({
        candidate_id,
        analysis_run_id,
        candidate_understanding: {
          ...understanding(
            qualified
              ? {}
              : { need_owner: "third_party", need_state: "none", market_role: "provider" },
          ),
          source_refs: [],
        },
      });
      await repo.insertAnalysisRun({
        id: analysis_run_id,
        candidate_id,
        status: "succeeded",
        analysis_input_fingerprint: `fp_${candidate_id}`,
        corpus_fingerprint: `corpus_${candidate_id}`,
        profile_semantic_hash: null,
        normalization_run_id: `norm_${candidate_id}`,
        extraction_json: extraction,
        prompt_version: "ai_radar_extraction_v1.2",
        model_id: "gpt-4.1-mini",
      });
      await repo.updateRefreshStateAfterNormalize({
        candidate_id,
        corpus_fingerprint: `corpus_${candidate_id}`,
        profile_semantic_hash: null,
        data_completeness: "full",
        current_analysis_run_id: analysis_run_id,
        validated_extraction_fingerprint: `fp_${candidate_id}`,
        now,
      });
      await repo.updateRefreshStateAfterEnrich({
        candidate_id,
        succeeded: true,
        now,
      });
      await repo.insertMemberScoreSnapshot({
        id: randomUUID(),
        member_id,
        candidate_id,
        analysis_run_id,
        baseline_score_snapshot_id: randomUUID(),
        overall_score: 55,
        component_scores: {},
        location_level: "unknown",
        snapshot_date: "2026-08-24",
        result: scoreResult(55),
      });
    }

    const ctx = {
      repo,
      queue: new RadarJobQueue(new InMemoryRadarJobQueueStore()),
      sources: createSourceAdapterRegistry(),
      now,
    };
    const job: RadarJobRecord = {
      id: randomUUID(),
      pipeline_run_id: "run-semantic",
      job_type: "rank",
      idempotency_key: "semantic-rank",
      status: "running",
      payload: { member_id, run_date: "2026-08-24" },
      priority: 0,
      attempt_count: 1,
      max_attempts: 3,
      scheduled_at: now.toISOString(),
      available_at: now.toISOString(),
      started_at: null,
      finished_at: null,
      error_code: null,
      error_message: null,
      trace_id: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    const result = await runRankWorker(ctx, job);
    expect(result.status).toBe("succeeded");
    const snapshot = await repo.getMemberDailyTop20(member_id, "2026-08-24");
    expect(snapshot?.items).toHaveLength(8);
    expect(snapshot?.items.every((item) => item.overall_score >= 40)).toBe(true);
  });

  it("conformance writes a Traditional Chinese reason and downgrades third-party needs", () => {
    const extraction = buildValidExtractionFixture({
      candidate_understanding: {
        ...understanding({
          need_owner: "third_party",
          need_state: "resolved",
          market_role: "provider",
        }),
        source_refs: [],
      },
    });
    const conformed = applyExtractionConformance(extraction);
    const data = conformed.data as ReturnType<typeof buildValidExtractionFixture>;
    expect(data.needs.availability).toBe("unknown");
    expect(data.change_window.change_intent.availability === "available"
      ? data.change_window.change_intent.level
      : "none").toBe("none");
  });

  it("language-skip extraction stays schema-valid and ineligible", () => {
    const language = classifyTextLanguage(
      "오늘의 러닝: 6K 이번달 누적 러닝: 159. 매일 아침 달리기를 하고 체중 관리를 하고 있어요.",
    );
    const extraction = buildLanguageSkipExtraction({
      candidate_id: "cand_ko",
      analysis_run_id: "run_ko",
      language,
    });
    expect(validateAiRadarExtraction(extraction).success).toBe(true);
    expect(evaluateSemanticEligibility(extraction.candidate_understanding).eligible).toBe(false);
  });

  it("partner card prefers structured Traditional Chinese reason", () => {
    const extraction = buildValidExtractionFixture({
      candidate_understanding: {
        ...understanding({
          recommendation_reason_zh:
            "近期多次提到已持續飲食控制與運動，但體重仍停滯，並表達挫折感，顯示本人仍有明確且尚未解決的減脂需求。",
        }),
        source_refs: [],
      },
    });
    const card = buildRadarPartnerCard({
      ranked: {
        candidateId: extraction.candidate_id,
        overall_score: 61,
        display_overall_score: 61,
        rank: 1,
        result: scoreResult(61),
      },
      candidate: {
        id: extraction.candidate_id,
        lifecycle_state: "active",
        display_name: "test",
        primary_platform: "threads",
        profile_semantic_hash: null,
        normalized_username: "ya_ran0821",
      },
      extraction,
      corpus: null,
      refresh: null,
      now: new Date("2026-08-24T08:00:00.000Z"),
      source_freshness_window_days: 7,
    });
    expect(card.why[0]).toMatch(/尚未解決/);
    expect(card.why[0]).not.toMatch(/Candidate mentions/i);
  });
});
