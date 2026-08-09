import { describe, expect, it } from "vitest";
import { assembleAnalysisScoringInput } from "./assemble-analysis-scoring-input";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot, REFERENCE_DATE } from "../normalization/test-fixtures";
import { buildValidExtractionFixture, withNormalizedSourceRefs } from "./test-fixtures";
import { validateAiRadarExtraction } from "./validate-ai-radar-extraction";

describe("validateAiRadarExtraction", () => {
  it("accepts a valid extraction payload", () => {
    const result = validateAiRadarExtraction(buildValidExtractionFixture());
    expect(result.success).toBe(true);
  });

  it("rejects LLM activity output", () => {
    const payload = {
      ...buildValidExtractionFixture(),
      activity: {
        availability: "available",
        last_meaningful_activity_at: "2026-08-08T09:30:00.000Z",
        source_refs: [],
        reasoning: "should not be here",
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.code === "FORBIDDEN_SCORE_FIELD")).toBe(
        true,
      );
    }
  });

  it("rejects LLM profile_observability output", () => {
    const payload = {
      ...buildValidExtractionFixture(),
      profile_observability: {
        data_completeness: "full",
        analyzable_items: [],
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
  });

  it("rejects forbidden score fields", () => {
    const payload = {
      ...buildValidExtractionFixture(),
      overall_score: 91,
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.code === "FORBIDDEN_SCORE_FIELD")).toBe(
        true,
      );
    }
  });

  it("rejects suggested_opening on extraction payload", () => {
    const payload = {
      ...buildValidExtractionFixture(),
      contactability: {
        ...buildValidExtractionFixture().contactability,
        suggested_opening: "你好",
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
  });

  it("rejects level none when availability is unknown", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      change_window: {
        ...fixture.change_window,
        change_intent: {
          availability: "unknown" as const,
          level: "none",
          source_refs: [],
          reasoning: "資料不足",
        },
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.code === "SCHEMA_PARSE_ERROR")).toBe(
        true,
      );
    }
  });

  it("rejects level field entirely when availability is partial", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      contactability: {
        ...fixture.contactability,
        interaction_openness: {
          availability: "partial" as const,
          level: "low",
          source_refs: [],
          reasoning: "互動資料不完整",
        },
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.code === "SCHEMA_PARSE_ERROR")).toBe(
        true,
      );
    }
  });

  it("allows available + none when source refs show reviewed content", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      change_window: {
        ...fixture.change_window,
        change_intent: {
          availability: "available" as const,
          level: "none" as const,
          source_refs: [{ platform: "threads" as const, content_id: "th_1" }],
          reasoning: "有足夠內容可判斷，但未見改變意圖。",
        },
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(true);
  });

  it("rejects available + none without source refs", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      change_window: {
        ...fixture.change_window,
        change_intent: {
          availability: "available" as const,
          level: "none" as const,
          source_refs: [],
          reasoning: "未見改變意圖",
        },
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
  });

  it("rejects needs.items when needs availability is unknown", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      needs: {
        availability: "unknown" as const,
        items: fixture.needs.availability === "available" ? fixture.needs.items : [],
        reasoning: "需求資料不足",
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.code === "SCHEMA_PARSE_ERROR")).toBe(
        true,
      );
    }
  });

  it("rejects need item with strength none", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      needs: {
        availability: "available" as const,
        reasoning: "test",
        items: [
          {
            need_id: "x",
            need_type: "body_composition_change",
            strength: "none" as const,
            relevance: "high_fit" as const,
            source_refs: [{ platform: "threads" as const, content_id: "th_1" }],
            reasoning: "不應使用 none",
          },
        ],
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
  });

  it("rejects income_pressure with relevance above adjacent ceiling", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      needs: {
        availability: "available" as const,
        reasoning: "收入壓力",
        items: [
          {
            need_id: "income",
            need_type: "income_pressure" as const,
            strength: "strong" as const,
            relevance: "relevant" as const,
            source_refs: [{ platform: "threads" as const, content_id: "th_1" }],
            reasoning: "薪水不夠用",
          },
        ],
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some((i) => i.code === "RELEVANCE_CEILING_VIOLATION"),
      ).toBe(true);
    }
  });

  it("requires direct evidence to upgrade relevant-default need to high_fit", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      needs: {
        availability: "available" as const,
        reasoning: "增肌需求",
        items: [
          {
            need_id: "muscle",
            need_type: "muscle_fitness_performance" as const,
            strength: "strong" as const,
            relevance: "high_fit" as const,
            source_refs: [{ platform: "threads" as const, content_id: "th_1" }],
            reasoning: "想增肌",
          },
        ],
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some((i) =>
          i.message.includes("relevance_evidence_quality=direct"),
        ),
      ).toBe(true);
    }
  });

  it("rejects umbrella need in scored needs when specific need exists", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      needs: {
        availability: "available" as const,
        reasoning: "多項需求",
        items: [
          ...(fixture.needs.availability === "available"
            ? fixture.needs.items
            : []),
          {
            need_id: "growth",
            need_type: "personal_growth_life_change" as const,
            strength: "clear" as const,
            relevance: "adjacent" as const,
            source_refs: [{ platform: "threads" as const, content_id: "th_1" }],
            reasoning: "想讓生活不一樣",
          },
        ],
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some((i) => i.message.includes("umbrella_need_tags")),
      ).toBe(true);
    }
  });

  it("rejects health_management with inferred medical reasoning", () => {
    const fixture = buildValidExtractionFixture();
    const payload = {
      ...fixture,
      needs: {
        availability: "available" as const,
        reasoning: "健康管理",
        items: [
          {
            need_id: "health",
            need_type: "health_management" as const,
            strength: "strong" as const,
            relevance: "relevant" as const,
            source_refs: [{ platform: "threads" as const, content_id: "th_1" }],
            reasoning: "健康檢查結果顯示血糖偏高，推測需要改善健康",
          },
        ],
      },
    };
    const result = validateAiRadarExtraction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.code === "FIT_POLICY_VIOLATION")).toBe(
        true,
      );
    }
  });

  it("maps unknown availability to scoring-safe defaults without treating as detected none", () => {
    const fixture = buildValidExtractionFixture({
      change_window: {
        change_intent: {
          availability: "unknown",
          reasoning: "貼文不足以判斷改變意圖",
        },
        behavioral_change: buildValidExtractionFixture().change_window.behavioral_change,
        solution_gap: buildValidExtractionFixture().change_window.solution_gap,
      },
      needs: {
        availability: "unknown",
        reasoning: "需求資料不足",
      },
      location: {
        availability: "unknown",
        reasoning: "位置資料不足",
      },
    });

    const validated = validateAiRadarExtraction(fixture);
    expect(validated.success).toBe(true);
    if (!validated.success) return;

    const corpus = normalizeCandidateContent({
      candidate_id: fixture.candidate_id,
      normalization_run_id: "norm_test",
      snapshots: [],
      referenceDate: REFERENCE_DATE,
    });

    const scoringInput = assembleAnalysisScoringInput(validated.data, {
      corpus,
      referenceDate: REFERENCE_DATE,
    });
    expect(scoringInput.changeWindow.changeIntent).toBe("none");
    expect(scoringInput.needs).toEqual([]);
    expect(scoringInput.activity.daysSinceLastMeaningfulActivity).toBeNull();
    expect(scoringInput.location.level).toBe("member_context_neutral");

    const withMemberAreas = assembleAnalysisScoringInput(validated.data, {
      corpus,
      referenceDate: REFERENCE_DATE,
      memberLocationContext: {
        primary_city: "台北市",
        primary_district: "大安區",
      },
    });
    expect(withMemberAreas.location.level).toBe("unknown");
  });

  it("validates source_ref.content_id against normalization corpus", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_ref_test",
      snapshots: [
        buildRawSnapshot({ external_content_id: "th_99102" }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    const payload = buildValidExtractionFixture({
      change_window: {
        ...buildValidExtractionFixture().change_window,
        change_intent: {
          availability: "available",
          level: "strong",
          source_refs: [{ platform: "threads", content_id: "unknown_id" }],
          reasoning: "bad ref",
        },
      },
    });

    const result = validateAiRadarExtraction(payload, { corpus });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.code === "SOURCE_REF_VIOLATION")).toBe(true);
    }
  });

  it("injects activity and observability from normalization pipeline", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_pipeline",
      snapshots: [
        buildRawSnapshot({ external_content_id: "th_99102" }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    const extraction = withNormalizedSourceRefs(
      buildValidExtractionFixture(),
      corpus.items[0].normalized_content_id,
      corpus.items[0].platform,
    );

    const validated = validateAiRadarExtraction(extraction, { corpus });
    expect(validated.success).toBe(true);
    if (!validated.success) return;

    const scoringInput = assembleAnalysisScoringInput(validated.data, {
      corpus,
      referenceDate: REFERENCE_DATE,
    });

    expect(scoringInput.activity.daysSinceLastMeaningfulActivity).toBe(1);
    expect(scoringInput.profileObservability?.analyzableItems).toHaveLength(1);
    expect(scoringInput.profileObservability?.dataCompleteness).toBe("full");
  });
});
