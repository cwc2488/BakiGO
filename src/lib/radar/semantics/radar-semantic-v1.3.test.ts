import { describe, expect, it } from "vitest";
import { applyExtractionConformance } from "../extraction/extraction-conformance";
import { buildValidExtractionFixture } from "../extraction/test-fixtures";
import { AI_RADAR_PROMPT_VERSION, buildAiRadarSystemPrompt } from "../ai/prompt";
import {
  emptyUnderstanding,
  evaluateSemanticEligibility,
  type CandidateUnderstanding,
} from "./candidate-understanding";

/**
 * RADAR-SEMANTIC-V1.3 — anonymized regression fixtures.
 * No names, phones, emails, tokens, or handles from Production.
 */

function understanding(
  overrides: Partial<CandidateUnderstanding> = {},
): CandidateUnderstanding {
  return emptyUnderstanding({
    need_owner: "self",
    need_state: "unresolved",
    market_role: "consumer",
    need_category: "fat_loss",
    evidence_confidence: 0.82,
    primary_language: "zh-Hant",
    traditional_chinese_usable: "true",
    ...overrides,
  });
}

function extractionWithUnderstanding(overrides: Partial<CandidateUnderstanding>) {
  return {
    ...buildValidExtractionFixture(),
    candidate_understanding: {
      ...understanding(overrides),
      source_refs: [],
    },
  };
}

describe("RADAR-SEMANTIC-V1.3 version contract", () => {
  it("ships prompt version ai_radar_extraction_v1.3", () => {
    expect(AI_RADAR_PROMPT_VERSION).toBe("ai_radar_extraction_v1.3");
  });

  it("prompt encodes activity≠need, maintenance≠gap, provider≠self-need", () => {
    const system = buildAiRadarSystemPrompt();
    expect(system).toContain("SEMANTIC v1.3");
    expect(system).toContain("activity ≠ unmet need");
    expect(system).toContain("success/maintenance ≠ unresolved");
    expect(system).toContain("ACTUAL GAP");
    expect(system).toContain("provider evidence");
    expect(system).toContain("NEVER the candidate's self need");
  });
});

describe("RADAR-SEMANTIC-V1.3 anonymized fixtures A–I", () => {
  it("A. successful weight loss + maintenance → not unresolved / not eligible", () => {
    const u = understanding({
      need_owner: "self",
      need_state: "resolved",
      market_role: "consumer",
      attempts: ["成功瘦身10公斤後持續維持"],
      unresolved_gap: null,
      help_seeking: "none",
      pain_points: [],
      recommendation_reason_zh: null,
    });
    const result = evaluateSemanticEligibility(u);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("resolved_success");
  });

  it("B. athlete training normally → activity alone is not unmet need", () => {
    const u = understanding({
      need_owner: "self",
      need_state: "none",
      market_role: "consumer",
      attempts: ["每週練跑備賽"],
      unresolved_gap: null,
      help_seeking: "none",
      pain_points: [],
    });
    expect(evaluateSemanticEligibility(u).eligible).toBe(false);

    // Misclassified in_progress without gap evidence is coerced by conformance.
    const conformed = applyExtractionConformance(
      extractionWithUnderstanding({
        need_owner: "self",
        need_state: "in_progress_with_gap",
        market_role: "consumer",
        attempts: ["每週練跑備賽"],
        unresolved_gap: null,
        help_seeking: "none",
        pain_points: [],
      }),
    );
    const understandingOut = (
      conformed.data as { candidate_understanding: CandidateUnderstanding }
    ).candidate_understanding;
    expect(understandingOut.need_state).toBe("none");
    expect(conformed.actions).toContain("understanding_gap_required");
    expect(evaluateSemanticEligibility(understandingOut).eligible).toBe(false);
  });

  it("C. provider teaching fat loss → provider evidence, not self need", () => {
    const u = understanding({
      need_owner: "general",
      need_state: "none",
      market_role: "provider",
      attempts: ["教學減脂課程"],
      unresolved_gap: null,
      help_seeking: "none",
      recommendation_reason_zh: null,
    });
    const result = evaluateSemanticEligibility(u);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("general_topic");
  });

  it("D. provider with separate explicit self help need → may survive", () => {
    const u = understanding({
      need_owner: "self",
      need_state: "unresolved",
      market_role: "provider",
      pain_points: ["我自己最後五公斤怎麼減都減不掉"],
      unresolved_gap: "需要幫助",
      help_seeking: "explicit",
      recommendation_reason_zh: "本人最後五公斤減不掉且明確求助",
    });
    const result = evaluateSemanticEligibility(u);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("self_unresolved_need");

    // Conformance must NOT wipe needs merely because market_role is provider.
    const conformed = applyExtractionConformance(extractionWithUnderstanding(u));
    const root = conformed.data as {
      needs: { availability: string };
      candidate_understanding: CandidateUnderstanding;
    };
    expect(root.needs.availability).not.toBe("unknown");
    expect(evaluateSemanticEligibility(root.candidate_understanding).eligible).toBe(true);
  });

  it("E. consumer explicitly struggling despite attempts → survive", () => {
    const u = understanding({
      need_owner: "self",
      need_state: "in_progress_with_gap",
      market_role: "consumer",
      attempts: ["飲食控制三個月", "每週健身"],
      unresolved_gap: "體重卡關兩個月",
      help_seeking: "implicit",
      pain_points: ["怎麼減都瘦不下來"],
    });
    expect(evaluateSemanticEligibility(u).eligible).toBe(true);
    expect(evaluateSemanticEligibility(u).reason).toBe("self_in_progress_with_gap");
  });

  it("F. consumer asking for help → survive", () => {
    const u = understanding({
      need_owner: "self",
      need_state: "unresolved",
      market_role: "consumer",
      help_seeking: "explicit",
      pain_points: ["有沒有人可以教我怎麼減脂"],
      unresolved_gap: "不知道從哪開始",
    });
    expect(evaluateSemanticEligibility(u).eligible).toBe(true);
  });

  it("G. third-party transformation story → not self need", () => {
    const u = understanding({
      need_owner: "third_party",
      need_state: "resolved",
      market_role: "consumer",
      pain_points: [],
      unresolved_gap: null,
    });
    expect(evaluateSemanticEligibility(u).reason).toBe("third_party_need");
  });

  it("H. normal fitness interest → not automatically commercial need", () => {
    const u = understanding({
      need_owner: "self",
      need_state: "none",
      market_role: "consumer",
      attempts: ["喜歡重訓與有氧"],
      help_seeking: "none",
      unresolved_gap: null,
      pain_points: [],
    });
    expect(evaluateSemanticEligibility(u).eligible).toBe(false);
  });

  it("I. genuine high-intent / Week-1-positive patterns preserved (consumer + mixed + provider)", () => {
    const consumer = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "in_progress_with_gap",
        market_role: "consumer",
        attempts: ["自己努力減脂"],
        unresolved_gap: "平台期突破不了",
        help_seeking: "implicit",
        pain_points: ["很挫折"],
      }),
    );
    const mixed = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "unresolved",
        market_role: "mixed",
        pain_points: ["自己體態回不去"],
        unresolved_gap: "需要系統方法",
        help_seeking: "explicit",
      }),
    );
    const provider = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "unresolved",
        market_role: "provider",
        pain_points: ["我自己也卡關"],
        unresolved_gap: "需要幫助",
        help_seeking: "explicit",
      }),
    );
    expect(consumer.eligible).toBe(true);
    expect(mixed.eligible).toBe(true);
    expect(provider.eligible).toBe(true);
  });
});

describe("RADAR-SEMANTIC-V1.3 conformance gap guardrail", () => {
  it("does not treat unresolved_gap alone as self-validating evidence", () => {
    const conformed = applyExtractionConformance(
      extractionWithUnderstanding({
        need_state: "in_progress_with_gap",
        unresolved_gap: "希望進一步改善體態",
        help_seeking: "none",
        pain_points: [],
        attempts: ["成功減重後持續重訓"],
      }),
    );
    const understandingOut = (
      conformed.data as { candidate_understanding: CandidateUnderstanding }
    ).candidate_understanding;
    expect(understandingOut.need_state).toBe("none");
    expect(understandingOut.unresolved_gap).toBeNull();
    expect(conformed.actions).toContain("understanding_gap_required");
    expect(evaluateSemanticEligibility(understandingOut).eligible).toBe(false);
  });

  it("keeps real stagnation when attempts + pain_points support the gap", () => {
    const conformed = applyExtractionConformance(
      extractionWithUnderstanding({
        need_state: "in_progress_with_gap",
        unresolved_gap: "體重卡住兩個月",
        help_seeking: "none",
        pain_points: ["體重卡住"],
        attempts: ["控制飲食三個月"],
      }),
    );
    const understandingOut = (
      conformed.data as { candidate_understanding: CandidateUnderstanding }
    ).candidate_understanding;
    expect(understandingOut.need_state).toBe("in_progress_with_gap");
    expect(conformed.actions).not.toContain("understanding_gap_required");
    expect(evaluateSemanticEligibility(understandingOut).eligible).toBe(true);
  });

  it("provider-only teaching still downgrades needs modules", () => {
    const conformed = applyExtractionConformance(
      extractionWithUnderstanding({
        need_owner: "general",
        need_state: "none",
        market_role: "provider",
        help_seeking: "none",
        unresolved_gap: null,
      }),
    );
    const root = conformed.data as { needs: { availability: string } };
    expect(root.needs.availability).toBe("unknown");
    expect(conformed.actions).toContain("understanding_third_party_downgraded");
  });
});

describe("RADAR-SEMANTIC-V1.3 self-validating gap loophole fixtures", () => {
  function afterConformance(overrides: Partial<CandidateUnderstanding>) {
    const conformed = applyExtractionConformance(extractionWithUnderstanding(overrides));
    const understandingOut = (
      conformed.data as { candidate_understanding: CandidateUnderstanding }
    ).candidate_understanding;
    return {
      conformed,
      understanding: understandingOut,
      eligibility: evaluateSemanticEligibility(understandingOut),
    };
  }

  it("1. successful weight loss + continued shaping + invented optimization gap → not eligible", () => {
    const { understanding: u, eligibility, conformed } = afterConformance({
      need_owner: "self",
      need_state: "in_progress_with_gap",
      market_role: "consumer",
      attempts: ["已成功減重10公斤", "持續重訓維持"],
      unresolved_gap: "希望進一步改善體態",
      help_seeking: "none",
      pain_points: [],
      recommendation_reason_zh: "希望進一步改善體態",
    });
    expect(conformed.actions).toContain("understanding_gap_required");
    expect(u.need_state).toBe("none");
    expect(u.unresolved_gap).toBeNull();
    expect(eligibility.eligible).toBe(false);
  });

  it("2. body fat already reduced + invented continue-lowering gap → not automatically eligible", () => {
    const { understanding: u, eligibility } = afterConformance({
      need_owner: "self",
      need_state: "in_progress_with_gap",
      market_role: "consumer",
      attempts: ["體脂已經顯著下降", "目前持續雕塑"],
      unresolved_gap: "希望繼續降低體脂",
      help_seeking: "none",
      pain_points: [],
    });
    expect(u.need_state).toBe("none");
    expect(eligibility.eligible).toBe(false);
  });

  it("3. regular athlete training + invented optimization gap → not eligible", () => {
    const { understanding: u, eligibility } = afterConformance({
      need_owner: "self",
      need_state: "in_progress_with_gap",
      market_role: "consumer",
      attempts: ["每週練跑備賽", "規律重訓"],
      unresolved_gap: "希望再提升成績與體能",
      help_seeking: "none",
      pain_points: [],
    });
    expect(u.need_state).toBe("none");
    expect(eligibility.eligible).toBe(false);
  });

  it("4. real stagnation despite attempts → eligible", () => {
    const { understanding: u, eligibility } = afterConformance({
      need_owner: "self",
      need_state: "in_progress_with_gap",
      market_role: "consumer",
      attempts: ["控制飲食三個月"],
      unresolved_gap: "體重卡住兩個月",
      help_seeking: "none",
      pain_points: ["體重卡住兩個月"],
    });
    expect(u.need_state).toBe("in_progress_with_gap");
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.reason).toBe("self_in_progress_with_gap");
  });

  it("5. explicit help after failed methods → eligible", () => {
    const { understanding: u, eligibility } = afterConformance({
      need_owner: "self",
      need_state: "in_progress_with_gap",
      market_role: "consumer",
      attempts: ["試了很多方法"],
      unresolved_gap: "還是瘦不下來",
      help_seeking: "explicit",
      pain_points: ["還是瘦不下來"],
    });
    expect(u.need_state).toBe("in_progress_with_gap");
    expect(eligibility.eligible).toBe(true);
  });

  it("6. provider with separate genuine SELF unresolved obstacle → preserved", () => {
    const { understanding: u, eligibility, conformed } = afterConformance({
      need_owner: "self",
      need_state: "in_progress_with_gap",
      market_role: "provider",
      attempts: ["自己也在減脂"],
      unresolved_gap: "最後五公斤怎麼減都減不掉",
      help_seeking: "explicit",
      pain_points: ["自己最後五公斤卡住"],
      recommendation_reason_zh: "本人最後五公斤卡住且明確求助",
    });
    expect(conformed.actions).not.toContain("understanding_gap_required");
    expect(u.need_state).toBe("in_progress_with_gap");
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.personal_need).toBe(true);
  });
});