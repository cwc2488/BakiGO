import { describe, expect, it } from "vitest";
import { buildOutcomeSignal } from "@/lib/coaching/referral/build-outcome-signal";
import { evaluateReferralOpportunity } from "@/lib/coaching/referral/evaluate-referral-opportunity";
import { extractCustomerConfirmedExperience } from "@/lib/coaching/referral/extract-customer-confirmed-experience";
import { planReferralOpportunityReconciliation } from "@/lib/coaching/referral/reconcile-referral-opportunity";
import { buildReferralOpportunityFingerprint } from "@/lib/coaching/referral/referral-opportunity-fingerprint";
import type { OutcomeSignal, ReferralOpportunityRecord } from "@/types/coaching-referral";
import type { CoachingOutcomeAssessment } from "@/types/coaching-signals";

const OWNER = "owner-1";
const CUSTOMER = "customer-1";
const ENROLLMENT = "enrollment-1";
const AS_OF = "2026-08-12";
const AS_OF_ISO = "2026-08-12T18:00:00.000+08:00";

function assessment(overrides: {
  outcomeStatus: CoachingOutcomeAssessment["outcomeStatus"];
  measurementStage: CoachingOutcomeAssessment["goalContext"]["measurementStage"];
  trendStatus?: CoachingOutcomeAssessment["trendStatus"];
  reasons?: string[];
  evidence?: Array<{ key: string; value: string | number }>;
}): CoachingOutcomeAssessment {
  return {
    outcomeStatus: overrides.outcomeStatus,
    trendStatus: overrides.trendStatus ?? "not_applicable",
    customerSummary: "fixture",
    comparison: null,
    periods: [],
    reasons: overrides.reasons ?? [],
    evidence: (overrides.evidence ?? []).map((item) => ({
      key: item.key,
      value: item.value,
    })),
    goalContext: {
      goalType: "fat_loss",
      goalLabel: "減脂",
      measurementStage: overrides.measurementStage,
      baselineDate: null,
      latestMeasurementDate: null,
      measurementCount: 0,
      daysSinceBaseline: null,
      daysSinceLatestMeasurement: null,
      daysSinceEnrollmentStart: 30,
      goalRelevantMetrics: [],
    },
  };
}

function signal(partial: Partial<OutcomeSignal> & Pick<OutcomeSignal, "outcomeStatus" | "measurementStage">): OutcomeSignal {
  const customerConfirmed =
    partial.customerConfirmed ??
    extractCustomerConfirmedExperience(null);
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
    celebrationClass: "none",
    customerConfirmed,
    ...partial,
  };
}

function evaluate(
  outcomeSignal: OutcomeSignal,
  extras?: Parameters<typeof evaluateReferralOpportunity>[0] extends infer T
    ? Omit<T, "outcomeSignal" | "evaluatingMemberId">
    : never,
) {
  return evaluateReferralOpportunity({
    outcomeSignal,
    evaluatingMemberId: OWNER,
    asOfIso: AS_OF_ISO,
    ...extras,
  });
}

function priorRow(overrides: Partial<ReferralOpportunityRecord>): ReferralOpportunityRecord {
  return {
    id: "opp-1",
    ownerMemberId: OWNER,
    customerId: CUSTOMER,
    enrollmentId: ENROLLMENT,
    readiness: "emerging",
    status: "open",
    fingerprint: "fp",
    celebrationClass: "soft",
    outcomeStatusSnapshot: "improving",
    measurementStageSnapshot: "comparison_available",
    pathwaySnapshot: "measured",
    evidenceJson: [],
    supportingSignalsJson: [],
    blockedReasonsJson: [],
    snoozeUntil: null,
    expiresAt: null,
    supersededBy: null,
    lastEvaluatedAt: AS_OF_ISO,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 4c customer-confirmed extractor", () => {
  it("classifies none / vague / explicit / struggle conservatively", () => {
    expect(extractCustomerConfirmedExperience(null).class).toBe("none");
    expect(extractCustomerConfirmedExperience("感覺還不錯").class).toBe("implicit_positive");
    expect(extractCustomerConfirmedExperience("我真的覺得精神改善很多").class).toBe(
      "explicit_positive_experience",
    );
    expect(extractCustomerConfirmedExperience("真的很滿意").class).toBe("explicit_satisfaction");
    expect(extractCustomerConfirmedExperience("我朋友也想試試看").class).toBe("explicit_referral_intent");
    expect(extractCustomerConfirmedExperience("我沒有感覺有效果").class).toBe("explicit_struggle");
  });

  it("RO-23/24 — coach opinion / AI prose must not form Path B", () => {
    expect(extractCustomerConfirmedExperience("我覺得她很滿意").class).toBe("none");
    expect(extractCustomerConfirmedExperience("她看起來對成果很滿意").class).toBe("none");
  });
});

describe("Phase 4c Referral Opportunity Engine — RO-01～RO-27", () => {
  it("RO-01 — improving + struggle (watch/hunger) → not_ready", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        celebrationClass: "clear",
        attentionTier: "watch",
        attentionReasonCodes: ["customer_voice_recurring_hunger"],
      }),
    );
    expect(result.readiness).toBe("not_ready");
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("struggle_active");
  });

  it("RO-02 — improving + explicit satisfaction → strong", () => {
    const confirmed = extractCustomerConfirmedExperience("真的很滿意");
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        customerConfirmed: confirmed,
        celebrationClass: "clear",
      }),
    );
    expect(result.readiness).toBe("strong");
    expect(result.shouldOpen).toBe(true);
    expect(result.pathway).toBe("measured_and_customer_confirmed");
  });

  it("RO-03 — mixed + meaningful muscle loss → block", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "mixed",
        measurementStage: "comparison_available",
        bodyQualityFlags: ["muscle_loss_meaningful", "weight_down_fake_success_risk"],
        celebrationClass: "soft",
      }),
    );
    expect(result.readiness).toBe("not_ready");
    expect(result.blockedReasons).toContain("outcome_mixed_muscle_loss");
  });

  it("RO-04 — positive recomposition → strong", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        bodyQualityFlags: ["recomposition"],
        celebrationClass: "clear",
      }),
    );
    expect(result.readiness).toBe("strong");
    expect(result.pathway).toBe("measured");
    expect(result.supportingSignals).toContain("path_a_trend_or_recomposition");
  });

  it("RO-05 — baseline_only without Path B → not_ready", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        celebrationClass: "none",
      }),
    );
    expect(result.readiness).toBe("not_ready");
    expect(result.blockedReasons).toContain("baseline_only_without_customer_confirmed");
  });

  it("RO-06 — stable execution, no body result → soft celebrate only", () => {
    const built = buildOutcomeSignal({
      customerId: CUSTOMER,
      enrollmentId: ENROLLMENT,
      ownerMemberId: OWNER,
      asOfLogDate: AS_OF,
      outcomeAssessment: assessment({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
      }),
      attentionTier: "routine",
      attentionReasonCodes: [],
      finalInterventionLevel: "normal",
      daysSinceEnrollmentStart: 10,
      customerNote: null,
      executionStable: true,
    });
    expect(built.celebrationClass).toBe("soft");
    const result = evaluate(built);
    expect(result.shouldOpen).toBe(false);
    expect(result.readiness).toBe("not_ready");
  });

  it("RO-07 (revised) — Customer explicit 有感 + no measurement → emerging Path B", () => {
    const confirmed = extractCustomerConfirmedExperience("真的有感");
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        customerConfirmed: confirmed,
        celebrationClass: "soft",
      }),
    );
    expect(result.readiness).toBe("emerging");
    expect(result.pathway).toBe("customer_confirmed");
    expect(result.outcomeSignal.outcomeStatus).toBe("not_yet_measurable");
    expect(result.shouldOpen).toBe(true);
  });

  it("RO-08 — ask_recent suppresses even when improving", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        celebrationClass: "clear",
      }),
      { recentAskAt: "2026-08-05T10:00:00.000Z" },
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("ask_recent");
  });

  it("RO-09 — declined cooldown", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        celebrationClass: "clear",
      }),
      {
        priorOpportunities: [
          priorRow({ status: "declined", updatedAt: "2026-08-01T00:00:00.000Z" }),
        ],
      },
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("declined_active");
  });

  it("RO-10 — snoozed same fingerprint → update keep snoozed, no insert", () => {
    const base = signal({
      outcomeStatus: "improving",
      measurementStage: "comparison_available",
      celebrationClass: "clear",
    });
    const result = evaluate(base);
    expect(result.shouldOpen).toBe(true);
    const plan = planReferralOpportunityReconciliation({
      evaluation: result,
      existing: [
        priorRow({
          id: "snooze-1",
          status: "snoozed",
          fingerprint: result.fingerprint,
          snoozeUntil: "2026-08-20T00:00:00.000Z",
        }),
      ],
      asOfIso: AS_OF_ISO,
    });
    expect(plan.action).toBe("update");
    if (plan.action === "update") {
      expect(plan.status).toBe("snoozed");
      expect(plan.opportunityId).toBe("snooze-1");
    }
  });

  it("RO-11 — acted cooldown blocks ordinary improvement reopen", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        celebrationClass: "clear",
      }),
      {
        priorOpportunities: [
          priorRow({
            status: "acted",
            measurementStageSnapshot: "comparison_available",
            outcomeStatusSnapshot: "improving",
            updatedAt: "2026-08-05T00:00:00.000Z",
          }),
        ],
      },
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("cooldown_active");
  });

  it("RO-12 — major breakthrough (first trend+improving) may bypass ask cooldown", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "trend_available",
        trendStatus: "improving",
        celebrationClass: "clear",
      }),
      {
        recentAskAt: "2026-08-05T10:00:00.000Z",
        priorOpportunities: [
          priorRow({
            status: "acted",
            measurementStageSnapshot: "comparison_available",
            outcomeStatusSnapshot: "improving",
            updatedAt: "2026-08-05T00:00:00.000Z",
          }),
        ],
      },
    );
    expect(result.majorBreakthrough).toBe(true);
    expect(result.readiness).toBe("strong");
    expect(result.shouldOpen).toBe(true);
    expect(result.blockedReasons).not.toContain("ask_recent");
  });

  it("RO-13 — converted same fingerprint → noop", () => {
    const base = signal({
      outcomeStatus: "improving",
      measurementStage: "comparison_available",
      celebrationClass: "clear",
    });
    const result = evaluate(base);
    const plan = planReferralOpportunityReconciliation({
      evaluation: result,
      existing: [priorRow({ status: "converted", fingerprint: result.fingerprint })],
      asOfIso: AS_OF_ISO,
    });
    expect(plan.action).toBe("noop");
  });

  it("RO-14 — same fingerprint daily → update not insert", () => {
    const base = signal({
      outcomeStatus: "improving",
      measurementStage: "comparison_available",
      celebrationClass: "clear",
    });
    const first = evaluate(base);
    const second = evaluate(base);
    expect(first.fingerprint).toBe(second.fingerprint);
    const plan = planReferralOpportunityReconciliation({
      evaluation: second,
      existing: [priorRow({ id: "open-1", status: "open", fingerprint: first.fingerprint })],
      asOfIso: AS_OF_ISO,
    });
    expect(plan.action).toBe("update");
  });

  it("RO-15 — owner mismatch → not_ready", () => {
    const result = evaluateReferralOpportunity({
      outcomeSignal: signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        celebrationClass: "clear",
      }),
      evaluatingMemberId: "other-owner",
      asOfIso: AS_OF_ISO,
    });
    expect(result.readiness).toBe("not_ready");
    expect(result.blockedReasons).toContain("owner_mismatch");
    expect(result.shouldOpen).toBe(false);
  });

  it("RO-16 — improving + coach_attention → Rescue > Referral", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        celebrationClass: "clear",
        attentionTier: "coach_attention",
        finalInterventionLevel: "coach_attention",
      }),
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("coach_attention_active");
  });

  it("RO-17 — flat + stable execution → not referral", () => {
    const built = buildOutcomeSignal({
      customerId: CUSTOMER,
      enrollmentId: ENROLLMENT,
      ownerMemberId: OWNER,
      asOfLogDate: AS_OF,
      outcomeAssessment: assessment({
        outcomeStatus: "flat",
        measurementStage: "comparison_available",
      }),
      attentionTier: "routine",
      attentionReasonCodes: [],
      finalInterventionLevel: "normal",
      daysSinceEnrollmentStart: 40,
      executionStable: true,
    });
    expect(built.celebrationClass).toBe("soft");
    const result = evaluate(built);
    expect(result.shouldOpen).toBe(false);
    expect(result.readiness).toBe("not_ready");
  });

  it("RO-18 — worsening → block", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "worsening",
        measurementStage: "comparison_available",
        celebrationClass: "none",
      }),
    );
    expect(result.readiness).toBe("not_ready");
    expect(result.blockedReasons).toContain("outcome_worsening");
  });

  it("RO-19 — baseline + vague positive → not_ready", () => {
    const confirmed = extractCustomerConfirmedExperience("感覺還不錯");
    expect(confirmed.class).toBe("implicit_positive");
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        customerConfirmed: confirmed,
        celebrationClass: "none",
      }),
    );
    expect(result.readiness).toBe("not_ready");
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("vague_positive_only");
  });

  it("RO-20 — baseline + explicit positive experience → emerging Path B; outcome unchanged", () => {
    const confirmed = extractCustomerConfirmedExperience("我真的覺得精神改善很多");
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        customerConfirmed: confirmed,
        celebrationClass: "soft",
      }),
    );
    expect(result.readiness).toBe("emerging");
    expect(result.pathway).toBe("customer_confirmed");
    expect(result.outcomeSignal.outcomeStatus).toBe("not_yet_measurable");
    expect(result.shouldOpen).toBe(true);
  });

  it("RO-21 — explicit satisfaction + measured improving → strong", () => {
    const confirmed = extractCustomerConfirmedExperience("非常滿意");
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        customerConfirmed: confirmed,
        celebrationClass: "clear",
      }),
    );
    expect(result.readiness).toBe("strong");
    expect(result.pathway).toBe("measured_and_customer_confirmed");
  });

  it("RO-22 — explicit referral intent → strong without waiting for body measurement", () => {
    const confirmed = extractCustomerConfirmedExperience("我朋友也想試試看");
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        customerConfirmed: confirmed,
        celebrationClass: "soft",
      }),
    );
    expect(confirmed.class).toBe("explicit_referral_intent");
    expect(result.readiness).toBe("strong");
    expect(result.pathway).toBe("explicit_intent");
    expect(result.supportingSignals).toContain("explicit_referral_intent");
    expect(result.shouldOpen).toBe(true);
  });

  it("RO-23 — coach note must not form customer-confirmed signal", () => {
    expect(extractCustomerConfirmedExperience("我覺得她很滿意").qualifiesPathB).toBe(false);
  });

  it("RO-24 — AI prose must not form signal", () => {
    expect(extractCustomerConfirmedExperience("她看起來對成果很滿意").class).toBe("none");
  });

  it("RO-25 — photo inference alone must not open Path B", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        customerConfirmed: extractCustomerConfirmedExperience(null),
        evidence: ["photo_looks_leaner=true"],
        celebrationClass: "none",
      }),
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.pathway).toBe("none");
  });

  it("RO-26 — explicit referral intent + coach_attention → blocked", () => {
    const confirmed = extractCustomerConfirmedExperience("我想介紹朋友");
    const result = evaluate(
      signal({
        outcomeStatus: "not_yet_measurable",
        measurementStage: "baseline_only",
        customerConfirmed: confirmed,
        attentionTier: "coach_attention",
        finalInterventionLevel: "coach_attention",
        celebrationClass: "soft",
      }),
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("coach_attention_active");
  });

  it("RO-27 — explicit struggle blocks even with weak positive wording present", () => {
    const confirmed = extractCustomerConfirmedExperience("感覺還不錯，但我沒有感覺有效果");
    expect(confirmed.class).toBe("explicit_struggle");
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        customerConfirmed: confirmed,
        celebrationClass: "clear",
      }),
    );
    expect(result.shouldOpen).toBe(false);
    expect(result.blockedReasons).toContain("explicit_dissatisfaction");
    expect(result.blockedReasons).toContain("struggle_active");
  });

  it("Path A — improving + comparison alone → emerging", () => {
    const result = evaluate(
      signal({
        outcomeStatus: "improving",
        measurementStage: "comparison_available",
        celebrationClass: "clear",
      }),
    );
    expect(result.readiness).toBe("emerging");
    expect(result.pathway).toBe("measured");
  });

  it("fingerprint changes when major evidence class changes", () => {
    const a = signal({
      outcomeStatus: "improving",
      measurementStage: "comparison_available",
      celebrationClass: "clear",
    });
    const b = signal({
      outcomeStatus: "improving",
      measurementStage: "trend_available",
      celebrationClass: "clear",
    });
    const fpA = buildReferralOpportunityFingerprint({
      outcomeSignal: a,
      pathway: "measured",
      readiness: "emerging",
    });
    const fpB = buildReferralOpportunityFingerprint({
      outcomeSignal: b,
      pathway: "measured",
      readiness: "strong",
    });
    expect(fpA).not.toBe(fpB);
    const plan = planReferralOpportunityReconciliation({
      evaluation: evaluate(b),
      existing: [priorRow({ id: "old", status: "open", fingerprint: fpA })],
      asOfIso: AS_OF_ISO,
    });
    expect(plan.action).toBe("supersede");
  });
});
