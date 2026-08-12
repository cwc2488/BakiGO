import { describe, expect, it } from "vitest";
import {
  deriveReferralCandidateView,
  REFERRAL_UI_STATE_LABELS,
  type ReferralCandidateSignals,
} from "@/lib/coaching/referral-share/referral-presentation";

function baseSignals(
  overrides: Partial<ReferralCandidateSignals> = {},
): ReferralCandidateSignals {
  return {
    customerId: "cust-1",
    displayName: "王小美",
    hasEnrollment: false,
    enrollmentId: null,
    openOpportunity: null,
    latestCheckin: null,
    activeShare: null,
    pendingConsentShare: null,
    attributionCount: 0,
    needsCoachAttribution: false,
    coachAttentionHint: false,
    ...overrides,
  };
}

describe("REF-UX Referral Center presentation", () => {
  it("REF-UX-01 — every customer signal produces a candidate view", () => {
    const customers = ["a", "b", "c"].map((id) =>
      deriveReferralCandidateView(baseSignals({ customerId: id, displayName: id })),
    );
    expect(customers).toHaveLength(3);
    expect(customers.every((c) => c.customerId && c.stateLabel)).toBe(true);
  });

  it("REF-UX-02 — no coaching enrollment → still visible + can manual start", () => {
    const view = deriveReferralCandidateView(
      baseSignals({ hasEnrollment: false, enrollmentId: null }),
    );
    expect(view.state).toBe("not_assessed");
    expect(view.canManualStart).toBe(true);
    expect(view.enrollmentId).toBeNull();
  });

  it("REF-UX-03 — no measurement / no opportunity → does not block manual referral", () => {
    const view = deriveReferralCandidateView(baseSignals());
    expect(view.canManualStart).toBe(true);
    expect(view.startWarning).toBeNull();
    expect(view.stateLabel).toBe("尚未評估");
  });

  it("REF-UX-04 — Growth suitable → 適合分享 states", () => {
    const social = deriveReferralCandidateView(
      baseSignals({
        hasEnrollment: true,
        enrollmentId: "enr-1",
        openOpportunity: {
          id: "opp-1",
          readiness: "strong",
          primaryGrowthPath: "social_proof",
          secondaryPaths: [],
          blockedReasons: [],
        },
      }),
    );
    expect(social.state).toBe("outcome_share_ready");
    expect(social.stateLabel).toBe(REFERRAL_UI_STATE_LABELS.outcome_share_ready);
    expect(social.canManualStart).toBe(true);

    const ask = deriveReferralCandidateView(
      baseSignals({
        openOpportunity: {
          id: "opp-2",
          readiness: "strong",
          primaryGrowthPath: "friend_benefit",
          secondaryPaths: [],
          blockedReasons: [],
        },
      }),
    );
    expect(ask.state).toBe("ask_ready");
  });

  it("REF-UX-05 — explicit referral intent → high priority best timing", () => {
    const view = deriveReferralCandidateView(
      baseSignals({
        latestCheckin: {
          struggleFlag: false,
          declineGrowthAsk: false,
          explicitReferralIntent: true,
          recommendationWillingness: 9,
          experienceSatisfaction: 5,
          coachHelpfulness: 5,
        },
        openOpportunity: {
          id: "opp-3",
          readiness: "strong",
          primaryGrowthPath: "coach_assisted_referral",
          secondaryPaths: [],
          blockedReasons: [],
        },
      }),
    );
    expect(view.state).toBe("best_timing");
    expect(view.reason).toContain("願意推薦");
  });

  it("REF-UX-06 — struggle / dissatisfaction → rescue warning wins (manual still allowed)", () => {
    const view = deriveReferralCandidateView(
      baseSignals({
        latestCheckin: {
          struggleFlag: true,
          declineGrowthAsk: false,
          explicitReferralIntent: true,
          recommendationWillingness: 9,
          experienceSatisfaction: 2,
          coachHelpfulness: 2,
        },
        openOpportunity: {
          id: "opp-4",
          readiness: "strong",
          primaryGrowthPath: "coach_assisted_referral",
          secondaryPaths: [],
          blockedReasons: ["struggle_active"],
        },
      }),
    );
    expect(view.state).toBe("pause_care_first");
    expect(view.startWarning).toBe("目前建議先處理顧客狀況");
    expect(view.canManualStart).toBe(true);
  });

  it("REF-UX-07 — existing active share → 分享進行中", () => {
    const view = deriveReferralCandidateView(
      baseSignals({
        activeShare: { id: "share-1", shareType: "coach_referral", status: "active" },
      }),
    );
    expect(view.state).toBe("sharing_active");
    expect(view.stateLabel).toBe("分享進行中");
    expect(view.canManualStart).toBe(false);

    const pending = deriveReferralCandidateView(
      baseSignals({
        pendingConsentShare: { id: "share-2", shareType: "coach_referral" },
      }),
    );
    expect(pending.primaryCta).toBe("confirm_consent");
    expect(pending.pendingShareId).toBe("share-2");
  });

  it("REF-UX-08 — attribution → 已產生轉介紹", () => {
    const view = deriveReferralCandidateView(
      baseSignals({
        attributionCount: 1,
        needsCoachAttribution: true,
      }),
    );
    expect(view.state).toBe("has_referral");
    expect(view.reason).toContain("接手");
  });

  it("REF-UX-09 — presentation is owner-scoped by construction (signals carry owned customerId only)", () => {
    const view = deriveReferralCandidateView(baseSignals({ customerId: "owner-a-cust" }));
    expect(view.customerId).toBe("owner-a-cust");
    // Cross-owner exclusion is enforced by loadReferralCenterBundle owner filter, not presentation.
  });

  it("REF-UX-10 — A→B attribution state remains independent of Growth Opportunity", () => {
    const view = deriveReferralCandidateView(
      baseSignals({
        openOpportunity: null,
        attributionCount: 2,
        needsCoachAttribution: false,
      }),
    );
    expect(view.state).toBe("has_referral");
    expect(view.opportunityId).toBeNull();
    expect(view.canManualStart).toBe(true);
  });
});
