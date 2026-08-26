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
    need_category: "body_transformation",
    pain_points: ["想減脂"],
    attempts: [],
    unresolved_gap: "還在卡關",
    urgency: "medium",
    help_seeking: "open",
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

  it("health provider with own unresolved fat-loss goal → reject", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "unresolved",
        market_role: "provider",
        pain_points: ["自己也想減脂"],
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("known_provider");
  });

  it("trainer complaining about own plateau → reject if provider identity established", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "in_progress_with_gap",
        market_role: "provider",
        unresolved_gap: "自己訓練也卡住",
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("known_provider");
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

  it("mixed provider/consumer with material service activity → reject", () => {
    const result = evaluateSemanticEligibility(
      understanding({
        need_owner: "self",
        need_state: "unresolved",
        market_role: "mixed",
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("known_mixed_provider");
  });
});

/**
 * Offline simulation of 2026-08-26 visible recommendations.
 * Understanding fields are reconstructed from stored card why + public evidence
 * (Production DB service role unavailable as Sensitive placeholder).
 * Does not write anything.
 */
describe("RADAR-PEER-QUALITY-02 today 2026-08-26 eligibility simulation", () => {
  const today = [
    {
      user: "wan._.zh",
      human: "B" as const,
      understanding: understanding({
        market_role: "mixed",
        need_owner: "self",
        need_state: "in_progress_with_gap",
        recommendation_reason_zh: "經營運動事業並減脂",
      }),
      caused_by_provider_self_rule: true,
    },
    {
      user: "wan.0711",
      human: "B" as const,
      understanding: understanding({
        market_role: "provider",
        need_owner: "self",
        need_state: "unresolved",
        recommendation_reason_zh: "推廣居家運動",
      }),
      caused_by_provider_self_rule: true,
    },
    {
      user: "prettygirllyyyyy",
      human: "C" as const,
      understanding: understanding({
        market_role: "unknown",
        need_owner: "self",
        need_state: "in_progress_with_gap",
      }),
      caused_by_provider_self_rule: false,
    },
    {
      user: "evelyn.huangg",
      human: "A" as const,
      understanding: understanding({
        market_role: "consumer",
        need_owner: "self",
        need_state: "in_progress_with_gap",
      }),
      caused_by_provider_self_rule: false,
    },
    {
      user: "ostri_123",
      human: "A" as const,
      understanding: understanding({
        market_role: "consumer",
        need_owner: "self",
        need_state: "unresolved",
      }),
      caused_by_provider_self_rule: false,
    },
    {
      user: "big_johnny_chung",
      human: "B" as const,
      understanding: understanding({
        market_role: "provider",
        need_owner: "self",
        need_state: "in_progress_with_gap",
        recommendation_reason_zh: "教學問答與體態維持",
      }),
      caused_by_provider_self_rule: true,
    },
    {
      user: "nnnmmm0903",
      human: "B" as const,
      understanding: understanding({
        market_role: "provider",
        need_owner: "self",
        need_state: "unresolved",
        recommendation_reason_zh: "推廣兒茶素出貨",
      }),
      caused_by_provider_self_rule: true,
    },
    {
      user: "lou2chj",
      human: "A" as const,
      understanding: understanding({ market_role: "consumer" }),
      caused_by_provider_self_rule: false,
    },
    {
      user: "angelawen124",
      human: "A" as const,
      understanding: understanding({ market_role: "consumer" }),
      caused_by_provider_self_rule: false,
    },
    {
      user: "fog_lijiahao",
      human: "D" as const,
      understanding: understanding({
        market_role: "consumer",
        need_state: "resolved",
      }),
      caused_by_provider_self_rule: false,
    },
    {
      user: "wangcj.bill",
      human: "A" as const,
      understanding: understanding({ market_role: "consumer" }),
      caused_by_provider_self_rule: false,
    },
    {
      user: "btssu.ga0309",
      human: "D" as const,
      understanding: understanding({
        need_owner: "third_party",
        need_state: "none",
        market_role: "consumer",
      }),
      caused_by_provider_self_rule: false,
    },
    {
      user: "80526kiki",
      human: "C" as const,
      understanding: understanding({ market_role: "unknown" }),
      caused_by_provider_self_rule: false,
    },
    {
      user: "lina19990628",
      human: "A" as const,
      understanding: understanding({ market_role: "consumer" }),
      caused_by_provider_self_rule: false,
    },
  ];

  function oldLogicWouldKeep(u: CandidateUnderstanding): boolean {
    // Pre-PEER-QUALITY-02: provider/mixed allowed when SELF unresolved/in_progress.
    if (u.need_owner === "third_party" || u.need_owner === "general") return false;
    if (u.need_state === "resolved" || u.need_state === "none" || u.need_owner === "unknown") {
      return false;
    }
    if (
      u.market_role === "provider" &&
      !(
        u.need_owner === "self" &&
        (u.need_state === "unresolved" || u.need_state === "in_progress_with_gap")
      )
    ) {
      return false;
    }
    return (
      u.need_owner === "self" &&
      (u.need_state === "unresolved" || u.need_state === "in_progress_with_gap")
    );
  }

  it("new logic removes known peers without removing genuine consumers in the audit set", () => {
    const changes = today.map((row) => {
      const oldKeep = oldLogicWouldKeep(row.understanding);
      const neu = evaluateSemanticEligibility(row.understanding);
      return {
        user: row.user,
        human: row.human,
        oldKeep,
        newKeep: neu.eligible,
        reason: neu.reason,
        caused_by_provider_self_rule: row.caused_by_provider_self_rule,
      };
    });

    const peersRemoved = changes.filter((c) => c.oldKeep && !c.newKeep && c.human === "B");
    const consumersRemoved = changes.filter((c) => c.oldKeep && !c.newKeep && c.human === "A");
    const ambiguousRemoved = changes.filter((c) => c.oldKeep && !c.newKeep && c.human === "C");

    expect(peersRemoved.map((c) => c.user).sort()).toEqual(
      ["big_johnny_chung", "nnnmmm0903", "wan._.zh", "wan.0711"].sort(),
    );
    expect(consumersRemoved).toEqual([]);
    expect(ambiguousRemoved).toEqual([]);
    expect(changes.filter((c) => c.caused_by_provider_self_rule && c.oldKeep && !c.newKeep)).toHaveLength(
      4,
    );
  });
});
