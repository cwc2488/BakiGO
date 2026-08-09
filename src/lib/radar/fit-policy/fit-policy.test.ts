import { describe, expect, it } from "vitest";
import { FIT_POLICY_V1, NEED_TYPE_SLUGS } from "./index";
import {
  validateHealthManagementEvidence,
  validateNeedRelevanceAgainstPolicy,
  validateUmbrellaNeedExclusion,
} from "./relevance-validation";
import { getNeedTypeDefinition } from "./need-types";

describe("FIT_POLICY_V1", () => {
  it("defines all 10 need types with org defaults", () => {
    expect(NEED_TYPE_SLUGS).toHaveLength(10);
    expect(FIT_POLICY_V1.need_types).toHaveLength(10);

    expect(getNeedTypeDefinition("income_pressure").default_relevance).toBe(
      "adjacent",
    );
    expect(getNeedTypeDefinition("career_dissatisfaction").default_relevance).toBe(
      "adjacent",
    );
    expect(
      getNeedTypeDefinition("personal_growth_life_change").default_relevance,
    ).toBe("adjacent");
  });

  it("decouples need definitions from behavioral action requirements", () => {
    for (const slug of [
      "body_composition_change",
      "weight_fat_management",
      "supplemental_income",
      "entrepreneurship_autonomy",
    ] as const) {
      const def = getNeedTypeDefinition(slug);
      expect(def.definition).toMatch(/不要求/);
    }
  });
});

describe("validateNeedRelevanceAgainstPolicy", () => {
  it("blocks relevant/high_fit on adjacent-default income_pressure", () => {
    const entry = getNeedTypeDefinition("income_pressure");
    const violation = validateNeedRelevanceAgainstPolicy({
      need_type: "income_pressure",
      relevance: "relevant",
      default_relevance: entry.default_relevance,
      relevance_ceiling: entry.relevance_ceiling,
      path: "needs.items[0].relevance",
    });
    expect(violation?.message).toContain("adjacent");
  });

  it("allows relevant default with direct evidence to upgrade to high_fit", () => {
    const entry = getNeedTypeDefinition("muscle_fitness_performance");
    const withoutDirect = validateNeedRelevanceAgainstPolicy({
      need_type: "muscle_fitness_performance",
      relevance: "high_fit",
      default_relevance: entry.default_relevance,
      relevance_ceiling: entry.relevance_ceiling,
      path: "needs.items[0].relevance",
    });
    expect(withoutDirect).not.toBeNull();

    const withDirect = validateNeedRelevanceAgainstPolicy({
      need_type: "muscle_fitness_performance",
      relevance: "high_fit",
      relevance_evidence_quality: "direct",
      default_relevance: entry.default_relevance,
      relevance_ceiling: entry.relevance_ceiling,
      path: "needs.items[0].relevance",
    });
    expect(withDirect).toBeNull();
  });
});

describe("validateUmbrellaNeedExclusion", () => {
  it("forbids personal_growth_life_change alongside specific scored needs", () => {
    const violation = validateUmbrellaNeedExclusion({
      items: [
        { need_type: "weight_fat_management" },
        { need_type: "personal_growth_life_change" },
      ],
    });
    expect(violation?.message).toContain("umbrella_need_tags");
  });

  it("allows personal_growth_life_change when it is the only need", () => {
    expect(
      validateUmbrellaNeedExclusion({
        items: [{ need_type: "personal_growth_life_change" }],
      }),
    ).toBeNull();
  });
});

describe("validateHealthManagementEvidence", () => {
  it("rejects inferred medical reasoning", () => {
    const violation = validateHealthManagementEvidence({
      reasoning: "從健康檢查結果顯示血糖偏高，推測需要健康管理",
      path: "needs.items[0].reasoning",
    });
    expect(violation?.message).toContain("Candidate-stated");
  });

  it("accepts candidate-stated wellness goals", () => {
    expect(
      validateHealthManagementEvidence({
        reasoning: "Candidate 明確表示想改善睡眠與精神體力",
        path: "needs.items[0].reasoning",
      }),
    ).toBeNull();
  });
});
