import { describe, expect, it } from "vitest";
import {
  evaluateSemanticEligibility,
  type CandidateUnderstanding,
} from "./candidate-understanding";

/**
 * RADAR-PEER-QUALITY-02 — focused peer / consumer matrix.
 * Eligibility uses structured market_role + need fields only (no keyword blacklist).
 */

function understanding(
  overrides: Partial<CandidateUnderstanding> = {},
): CandidateUnderstanding {
  return {
    need_owner: "self",
    need_state: "unresolved",
    market_role: "consumer",
    need_category: "fat_loss",
    pain_points: ["想減脂"],
    attempts: [],
    unresolved_gap: "還在卡關",
    urgency: "medium",
    help_seeking: "implicit",
    evidence_confidence: 0.8,
    primary_language: "zh-Hant",
    traditional_chinese_usable: "true",
    candidate_region: null,
    region_confidence: "unknown",
    region_evidence: null,
    recommendation_reason_zh: "本人體態需求尚未解決",
    ...overrides,
  };
}

describe("RADAR-PEER-QUALITY-02 semantic peer matrix", () => {
  it("fitness coach posting client result → reject", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "third_party",
        need_state: "resolved",
        market_role: "provider",
        recommendation_reason_zh: null,
      }),
    );
    expect(result.eligible).toBe(false);
  });

  it("nutrition provider offering consultation → reject", () => {
    expect(
      evaluateSemanticEligibility(
        understanding({
          need_owner: "general",
          need_state: "none",
          market_role: "provider",
        }),
      ).eligible,
    ).toBe(false);
  });

  it("health provider with independently evidenced own unresolved fat-loss goal → eligible", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "unresolved",
        market_role: "provider",
        pain_points: ["自己也想減脂"],
        unresolved_gap: "自己怎麼減都減不掉",
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("self_unresolved_need");
  });

  it("trainer with own plateau gap may survive when self need is separate from teaching", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "in_progress_with_gap",
        market_role: "provider",
        unresolved_gap: "自己訓練也卡住",
        help_seeking: "implicit",
        pain_points: ["自己體重卡住"],
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("self_in_progress_with_gap");
  });

  it("ordinary consumer complaining about plateau → eligible", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "in_progress_with_gap",
        market_role: "consumer",
        attempts: ["自己健身三個月"],
        unresolved_gap: "體重卡兩個月",
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it("ordinary consumer already successfully completed goal → reject", () => {
    expect(
      evaluateSemanticEligibility(
        understanding({
          need_owner: "self",
          need_state: "resolved",
          market_role: "consumer",
        }),
      ).eligible,
    ).toBe(false);
  });

  it("consumer discussing celebrity transformation → reject third_party", () => {
    expect(
      evaluateSemanticEligibility(
        understanding({
          need_owner: "third_party",
          need_state: "none",
          market_role: "consumer",
        }),
      ).reason,
    ).toBe("third_party_need");
  });

  it("consumer exercising regularly but still stuck → eligible", () => {
    expect(
      evaluateSemanticEligibility(
        understanding({
          need_owner: "self",
          need_state: "in_progress_with_gap",
          market_role: "consumer",
          attempts: ["每週跑步"],
          unresolved_gap: "體脂下不來",
        }),
      ).eligible,
    ).toBe(true);
  });

  it("ambiguous fitness enthusiast without provider evidence → do not reject solely as peer", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        market_role: "unknown",
        need_owner: "self",
        need_state: "unresolved",
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).not.toMatch(/provider|mixed/);
  });

  it("mixed provider/consumer with genuine self unmet need → eligible (v1.3)", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "unresolved",
        market_role: "mixed",
        pain_points: ["自己最後五公斤減不掉"],
        unresolved_gap: "需要幫助",
        help_seeking: "explicit",
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("self_unresolved_need");
  });

  it("provider teaching only (no self unmet need) → reject", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "general",
        need_state: "none",
        market_role: "provider",
        unresolved_gap: null,
        help_seeking: "none",
        recommendation_reason_zh: null,
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("general_topic");
  });
});

/**
 * Offline semantic-label simulation (anonymized).
 * v1.3: eligibility keeps genuine SELF unmet need even when market_role is
 * provider/mixed; pure teaching / client stories stay out.
 */
describe("RADAR-PEER-QUALITY-02 v1.3 eligibility simulation", () => {
  const today = [
    {
      id: "anon_mixed_business",
      human: "B" as const,
      understanding: understanding({
        market_role: "mixed",
        need_owner: "general",
        need_state: "none",
        recommendation_reason_zh: null,
      }),
    },
    {
      id: "anon_provider_promo",
      human: "B" as const,
      understanding: understanding({
        market_role: "provider",
        need_owner: "general",
        need_state: "none",
        recommendation_reason_zh: null,
      }),
    },
    {
      id: "anon_ambiguous",
      human: "C" as const,
      understanding: understanding({
        market_role: "unknown",
        need_owner: "self",
        need_state: "in_progress_with_gap",
        unresolved_gap: "體脂卡住",
        help_seeking: "implicit",
        pain_points: ["減脂停滯"],
      }),
    },
    {
      id: "anon_consumer_gap",
      human: "A" as const,
      understanding: understanding({
        market_role: "consumer",
        need_owner: "self",
        need_state: "in_progress_with_gap",
        unresolved_gap: "體重卡關",
        help_seeking: "implicit",
        pain_points: ["瘦不下來"],
      }),
    },
    {
      id: "anon_consumer_unresolved",
      human: "A" as const,
      understanding: understanding({
        market_role: "consumer",
        need_owner: "self",
        need_state: "unresolved",
      }),
    },
    {
      id: "anon_provider_teaching_as_self_mislabel_fixed",
      human: "B" as const,
      understanding: understanding({
        market_role: "provider",
        need_owner: "general",
        need_state: "none",
        recommendation_reason_zh: null,
      }),
    },
    {
      id: "anon_provider_genuine_self",
      human: "A" as const,
      understanding: understanding({
        market_role: "provider",
        need_owner: "self",
        need_state: "unresolved",
        pain_points: ["我自己最後五公斤減不掉"],
        unresolved_gap: "需要幫助",
        help_seeking: "explicit",
      }),
    },
    {
      id: "anon_consumer_ok_1",
      human: "A" as const,
      understanding: understanding({ market_role: "consumer" }),
    },
    {
      id: "anon_consumer_ok_2",
      human: "A" as const,
      understanding: understanding({ market_role: "consumer" }),
    },
    {
      id: "anon_resolved",
      human: "D" as const,
      understanding: understanding({
        market_role: "consumer",
        need_state: "resolved",
      }),
    },
    {
      id: "anon_consumer_ok_3",
      human: "A" as const,
      understanding: understanding({ market_role: "consumer" }),
    },
    {
      id: "anon_third_party",
      human: "D" as const,
      understanding: understanding({
        need_owner: "third_party",
        need_state: "none",
        market_role: "consumer",
      }),
    },
    {
      id: "anon_unknown_role",
      human: "C" as const,
      understanding: understanding({ market_role: "unknown" }),
    },
    {
      id: "anon_consumer_ok_4",
      human: "A" as const,
      understanding: understanding({ market_role: "consumer" }),
    },
  ];

  it("rejects pure peers without removing genuine self needs (including provider+self)", () => {
    const changes = today.map((row) => {
      const neu = evaluateSemanticEligibility(row.understanding);
      return {
        id: row.id,
        human: row.human,
        keep: neu.eligible,
        reason: neu.reason,
      };
    });

    const peersKept = changes.filter((c) => c.human === "B" && c.keep);
    const consumersRemoved = changes.filter((c) => c.human === "A" && !c.keep);
    const genuineProviderKept = changes.find((c) => c.id === "anon_provider_genuine_self");

    expect(peersKept).toEqual([]);
    expect(consumersRemoved).toEqual([]);
    expect(genuineProviderKept?.keep).toBe(true);
    expect(changes.find((c) => c.id === "anon_resolved")?.keep).toBe(false);
    expect(changes.find((c) => c.id === "anon_third_party")?.keep).toBe(false);
  });
});
