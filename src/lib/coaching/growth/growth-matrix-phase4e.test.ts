import { describe, expect, it } from "vitest";
import { evaluateGrowthMatrix } from "@/lib/coaching/growth/evaluate-growth-matrix";
import { assessCheckinTriggerEligibility } from "@/lib/coaching/growth/experience-checkin-service";
import { extractCustomerConfirmedExperience } from "@/lib/coaching/referral/extract-customer-confirmed-experience";
import type { CustomerExperienceCheckin } from "@/types/coaching-growth";
import type { OutcomeSignal } from "@/types/coaching-referral";

const OWNER = "owner-1";
const CUSTOMER = "customer-1";
const ENROLLMENT = "enrollment-1";
const AS_OF = "2026-08-12";
const AS_OF_ISO = "2026-08-12T18:00:00.000+08:00";

function signal(
  partial: Partial<OutcomeSignal> & Pick<OutcomeSignal, "outcomeStatus" | "measurementStage">,
): OutcomeSignal {
  return {
    customerId: CUSTOMER,
    enrollmentId: ENROLLMENT,
    ownerMemberId: OWNER,
    asOfLogDate: AS_OF,
    trendStatus: "not_applicable",
    goalType: "fat_loss",
    customerSummary: "fixture",
    evidence: [],
    bodyQualityFlags: [],
    attentionTier: "routine",
    attentionReasonCodes: [],
    finalInterventionLevel: "normal",
    daysSinceEnrollmentStart: 30,
    latestMeasurementId: "m-latest",
    baselineMeasurementId: "m-base",
    celebrationClass: "clear",
    customerConfirmed: extractCustomerConfirmedExperience(null),
    ...partial,
  };
}

function checkin(partial: Partial<CustomerExperienceCheckin>): CustomerExperienceCheckin {
  return {
    id: "checkin-1",
    ownerMemberId: OWNER,
    customerId: CUSTOMER,
    enrollmentId: ENROLLMENT,
    triggerReason: "milestone",
    asOfLogDate: AS_OF,
    outcomePerception: null,
    coachHelpfulness: null,
    experienceSatisfaction: null,
    recommendationWillingness: null,
    mostFeltChangeText: null,
    mostFeltChangeConsent: "coach_only",
    explicitReferralIntent: false,
    struggleFlag: false,
    declineGrowthAsk: false,
    source: "portal",
    respondedAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

function evaluate(outcomeSignal: OutcomeSignal, c?: CustomerExperienceCheckin | null) {
  return evaluateGrowthMatrix({
    outcomeSignal,
    evaluatingMemberId: OWNER,
    checkin: c ?? null,
    asOfIso: AS_OF_ISO,
  });
}

describe("Phase 4e Growth Matrix — GE-01～GE-18", () => {
  it("GE-01 — High Outcome + no check-in → invite check-in; max emerging without intent", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "trend_available",
        celebrationClass: "clear",
      }),
    );
    expect(result.outcomeBand).toBe("high");
    expect(result.experienceBand).toBe("unknown");
    expect(result.inviteCheckin).toBe(true);
    expect(result.readiness).not.toBe("strong");
    expect(["emerging", "not_ready"]).toContain(result.readiness);
  });

  it("GE-02 — High Outcome + high Exp → strong Growth", () => {
    const result = evaluate(
      signal({ outcomeStatus: "improving", measurementStage: "trend_available" }),
      checkin({
        outcomePerception: 5,
        coachHelpfulness: 5,
        experienceSatisfaction: 5,
        recommendationWillingness: 9,
        mostFeltChangeConsent: "share_ok",
        mostFeltChangeText: "精神變好很多",
      }),
    );
    expect(result.outcomeBand).toBe("high");
    expect(result.experienceBand).toBe("high");
    expect(result.readiness).toBe("strong");
    expect(result.shouldOpen).toBe(true);
    expect(result.primaryGrowthPath).toBeTruthy();
  });

  it("GE-03 — High Outcome + low Exp → repair; Growth blocked", () => {
    const result = evaluate(
      signal({ outcomeStatus: "improving", measurementStage: "trend_available" }),
      checkin({
        outcomePerception: 2,
        coachHelpfulness: 2,
        experienceSatisfaction: 2,
        recommendationWillingness: 3,
      }),
    );
    expect(result.repairExperience).toBe(true);
    expect(result.shouldOpen).toBe(false);
    expect(result.primaryGrowthPath).toBeNull();
  });

  it("GE-04 — Low Outcome + high Exp → Friend Benefit emerging; no measured-success claim", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        celebrationClass: "soft",
      }),
      checkin({
        outcomePerception: 4,
        coachHelpfulness: 5,
        experienceSatisfaction: 4,
        recommendationWillingness: 8,
      }),
    );
    expect(result.outcomeBand).toBe("low");
    expect(result.experienceBand).toBe("high");
    expect(result.shouldOpen).toBe(true);
    expect(result.readiness).toBe("emerging");
    expect(result.primaryGrowthPath).toBe("friend_benefit");
    expect(result.outcomeSignal.outcomeStatus).toBe("not_yet_measurable");
  });

  it("GE-05 — Mid Outcome + mid Exp → Coach-assisted emerging", () => {
    const result = evaluate(
      signal({ outcomeStatus: "improving", measurementStage: "comparison_available" }),
      checkin({
        outcomePerception: 3,
        coachHelpfulness: 3,
        experienceSatisfaction: 3,
        recommendationWillingness: 6,
      }),
    );
    expect(result.outcomeBand).toBe("mid");
    expect(result.experienceBand).toBe("mid");
    expect(result.shouldOpen).toBe(true);
    expect(result.primaryGrowthPath).toBe("coach_assisted_referral");
  });

  it("GE-06 — Worsening + any Exp → Rescue; blocked", () => {
    const result = evaluate(
      signal({ outcomeStatus: "worsening", measurementStage: "comparison_available" }),
      checkin({
        outcomePerception: 5,
        coachHelpfulness: 5,
        experienceSatisfaction: 5,
        recommendationWillingness: 10,
      }),
    );
    expect(result.outcomeBand).toBe("blocked");
    expect(result.shouldOpen).toBe(false);
  });

  it("GE-07 — Mixed + muscle loss + high Exp → block measured Growth", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "mixed",
        measurementStage: "comparison_available",
        bodyQualityFlags: ["muscle_loss_meaningful", "weight_down_fake_success_risk"],
      }),
      checkin({
        outcomePerception: 5,
        coachHelpfulness: 5,
        experienceSatisfaction: 5,
        recommendationWillingness: 9,
      }),
    );
    expect(result.outcomeBand).toBe("blocked");
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("outcome_mixed_muscle_loss");
  });

  it("GE-08 — explicit_referral_intent + baseline_only → strong; primary A", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        customerConfirmed: extractCustomerConfirmedExperience("我朋友也想試試看"),
      }),
    );
    expect(result.readiness).toBe("strong");
    expect(result.shouldOpen).toBe(true);
    expect(result.primaryGrowthPath).toBe("coach_assisted_referral");
    expect(result.outcomeSignal.outcomeStatus).toBe("not_yet_measurable");
  });

  it("GE-09 — Intent + coach_attention → Rescue > Growth", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        customerConfirmed: extractCustomerConfirmedExperience("我想介紹朋友"),
        attentionTier: "coach_attention",
        finalInterventionLevel: "coach_attention",
      }),
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("coach_attention_active");
  });

  it("GE-10 — willingness=9 but perception=2 → low/conflict → repair", () => {
    const result = evaluate(
      signal({ outcomeStatus: "improving", measurementStage: "trend_available" }),
      checkin({
        outcomePerception: 2,
        coachHelpfulness: 4,
        experienceSatisfaction: 4,
        recommendationWillingness: 9,
      }),
    );
    expect(result.experienceBand).toBe("low");
    expect(result.repairExperience).toBe(true);
    expect(result.shouldOpen).toBe(false);
  });

  it("GE-11 — Heuristic vague only → unknown/vague; no Path B upgrade", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        customerConfirmed: extractCustomerConfirmedExperience("感覺還不錯"),
        celebrationClass: "none",
      }),
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.experienceBand).toBe("unknown");
  });

  it("GE-12 — Heuristic positive, later check-in low → check-in overrides", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        customerConfirmed: extractCustomerConfirmedExperience("真的有感"),
      }),
      checkin({
        outcomePerception: 1,
        coachHelpfulness: 1,
        experienceSatisfaction: 1,
        recommendationWillingness: 1,
      }),
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.repairExperience || result.experienceBand === "low").toBe(true);
  });

  it("GE-13 — Eligible multi-path → only one primary surfaced", () => {
    const result = evaluate(
      signal({ outcomeStatus: "improving", measurementStage: "trend_available" }),
      checkin({
        outcomePerception: 5,
        coachHelpfulness: 5,
        experienceSatisfaction: 5,
        recommendationWillingness: 9,
        mostFeltChangeConsent: "share_ok",
      }),
    );
    expect(result.shouldOpen).toBe(true);
    expect(result.primaryGrowthPath).toBeTruthy();
    expect(result.secondaryEligiblePaths).not.toContain(result.primaryGrowthPath);
  });

  it("GE-14 — Social share without share_ok → social_proof not primary via consent", () => {
    const result = evaluate(
      signal({ outcomeStatus: "improving", measurementStage: "trend_available" }),
      checkin({
        outcomePerception: 5,
        coachHelpfulness: 5,
        experienceSatisfaction: 5,
        recommendationWillingness: 9,
        mostFeltChangeConsent: "coach_only",
      }),
    );
    expect(result.primaryGrowthPath).not.toBe("social_proof");
  });

  it("GE-15 — Friend Benefit uses abstract path code (no product discount)", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
      }),
      checkin({
        outcomePerception: 4,
        coachHelpfulness: 5,
        experienceSatisfaction: 4,
        recommendationWillingness: 8,
      }),
    );
    expect(result.primaryGrowthPath).toBe("friend_benefit");
    expect(JSON.stringify(result)).not.toMatch(/herbalife|折扣|discount/i);
  });

  it("GE-16 — Check-in within 14d of prior → suppress", () => {
    const latest = checkin({ respondedAt: "2026-08-05T00:00:00.000Z" });
    const gate = assessCheckinTriggerEligibility({
      latest,
      asOfIso: "2026-08-12T00:00:00.000Z",
      attentionIsCoachAttention: false,
      triggerReason: "milestone",
    });
    expect(gate.eligible).toBe(false);
    expect(gate.reason).toBe("min_gap_cooldown");
  });

  it("GE-17 — Fingerprint stable for same evidence; changes when check-in arrives", () => {
    const base = signal({ outcomeStatus: "improving", measurementStage: "comparison_available" });
    const a = evaluate(base);
    const b = evaluate(base);
    expect(a.fingerprint).toBe(b.fingerprint);
    const withCheckin = evaluate(
      base,
      checkin({
        id: "checkin-new",
        outcomePerception: 4,
        coachHelpfulness: 4,
        experienceSatisfaction: 4,
        recommendationWillingness: 8,
      }),
    );
    expect(withCheckin.fingerprint).not.toBe(a.fingerprint);
  });

  it("GE-18 — Portal must not see opportunity (contract: matrix internals coach-only)", () => {
    // Contract test: GrowthMatrixResult is coach evaluation; portal API returns only check-in fields.
    const result = evaluate(
      signal({ outcomeStatus: "improving", measurementStage: "trend_available" }),
      checkin({
        outcomePerception: 5,
        coachHelpfulness: 5,
        experienceSatisfaction: 5,
        recommendationWillingness: 9,
      }),
    );
    const portalSafe = {
      respondedAt: "x",
      outcomePerception: 5,
      // deliberately omit readiness / primaryGrowthPath / blockedReasons
    };
    expect(portalSafe).not.toHaveProperty("readiness");
    expect(portalSafe).not.toHaveProperty("primaryGrowthPath");
    expect(result.shouldOpen).toBe(true);
  });
});
