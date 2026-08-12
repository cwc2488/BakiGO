import { describe, expect, it } from "vitest";
import {
  GrowthLoopMemoryStore,
  makeCheckin,
  makeOutcomeSignal,
} from "@/lib/coaching/referral-share/growth-loop-memory";
import { FRIEND_BENEFIT_DEFAULT } from "@/types/coaching-referral-share";
import {
  generateGrowthShareToken,
  hashGrowthShareToken,
  isPlausibleGrowthShareToken,
} from "@/lib/coaching/referral-share/share-token";
import { assessShareStartEligibility } from "@/lib/coaching/referral-share/share-eligibility";
import { evaluateGrowthMatrix } from "@/lib/coaching/growth/evaluate-growth-matrix";

const OWNER = "owner-1";
const OTHER = "owner-2";
const CUSTOMER_A = "customer-a";

function seedStrongOpportunity(store: GrowthLoopMemoryStore) {
  store.addCustomer({
    id: CUSTOMER_A,
    ownerMemberId: OWNER,
    displayName: "王小美",
    phone: "0911111111",
  });
  store.addOpportunity({
    id: "opp-1",
    ownerMemberId: OWNER,
    customerId: CUSTOMER_A,
    enrollmentId: "enrollment-1",
    status: "open",
    readiness: "strong",
    primaryGrowthPath: "coach_assisted_referral",
    secondaryPathsJson: ["social_proof", "friend_benefit"],
  });
}

describe("Phase 4f Growth Loop — RF-01～RF-30", () => {
  it("RF-01 — strong growth → share eligible", () => {
    const matrix = evaluateGrowthMatrix({
      outcomeSignal: makeOutcomeSignal({
        outcomeStatus: "improving",
        measurementStage: "trend_available",
      }),
      evaluatingMemberId: OWNER,
      checkin: makeCheckin(),
      asOfIso: "2026-08-12T12:00:00.000Z",
    });
    expect(matrix.shouldOpen).toBe(true);
    expect(matrix.readiness).toBe("strong");
    expect(matrix.primaryGrowthPath).not.toBeNull();
  });

  it("RF-02 — blocked growth → cannot start", () => {
    const store = new GrowthLoopMemoryStore();
    store.addOpportunity({
      id: "opp-blocked",
      ownerMemberId: OWNER,
      customerId: CUSTOMER_A,
      enrollmentId: "enrollment-1",
      status: "open",
      readiness: "emerging",
      primaryGrowthPath: null,
      secondaryPathsJson: [],
    });
    expect(() =>
      store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-blocked" }),
    ).toThrow();
  });

  it("RF-03 — coach starts outcome share", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const { share } = store.coachStart({
      ownerMemberId: OWNER,
      opportunityId: "opp-1",
      shareType: "outcome_share",
    });
    expect(share.shareType).toBe("outcome_share");
    expect(share.status).toBe("pending_consent");
  });

  it("RF-04 — coach starts coach referral", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const { share } = store.coachStart({
      ownerMemberId: OWNER,
      opportunityId: "opp-1",
      shareType: "coach_referral",
    });
    expect(share.shareType).toBe("coach_referral");
  });

  it("RF-05 — customer consent required before public accepts", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const { share, plaintextToken } = store.coachStart({
      ownerMemberId: OWNER,
      opportunityId: "opp-1",
    });
    const pendingPayload = store.resolvePublic(plaintextToken);
    expect(pendingPayload?.acceptsNewReferral).toBe(false);
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: true,
        showDayCount: true,
        showMeasurementDelta: false,
        shareText: "我感覺身體比較輕鬆",
        measurementDeltaSummary: null,
      },
    });
    expect(activated.share.status).toBe("active");
    expect(store.resolvePublic(activated.plaintextToken)?.acceptsNewReferral).toBe(true);
  });

  it("RF-06 — token random/unpredictable", () => {
    const a = generateGrowthShareToken();
    const b = generateGrowthShareToken();
    expect(a).not.toBe(b);
    expect(isPlausibleGrowthShareToken(a)).toBe(true);
    expect(isPlausibleGrowthShareToken("ABC123")).toBe(false);
    expect(hashGrowthShareToken(a)).not.toBe(a);
    expect(hashGrowthShareToken(a)).toHaveLength(64);
  });

  it("RF-07 — valid public token", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: true,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    expect(store.resolvePublic(activated.plaintextToken)?.shareId).toBe(started.share.id);
  });

  it("RF-08 — invalid token", () => {
    const store = new GrowthLoopMemoryStore();
    expect(store.resolvePublic("not-a-real-token-value-xxxxxx")).toBeNull();
    expect(store.resolvePublic("short")).toBeNull();
  });

  it("RF-09 — revoked token", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    store.revoke(started.share.id, OWNER);
    expect(store.resolvePublic(activated.plaintextToken)?.acceptsNewReferral).toBe(false);
  });

  it("RF-10 — expired token", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    activated.share.expiresAt = "2026-08-01T00:00:00.000Z";
    expect(
      store.resolvePublic(activated.plaintextToken, Date.parse("2026-08-12T00:00:00.000Z"))
        ?.acceptsNewReferral,
    ).toBe(false);
  });

  it("RF-11 — public payload privacy", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({
      ownerMemberId: OWNER,
      opportunityId: "opp-1",
      shareType: "outcome_share",
    });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: true,
        showMeasurementDelta: false,
        shareText: "精神比較好",
        measurementDeltaSummary: "不應出現",
      },
    });
    const payload = store.resolvePublic(activated.plaintextToken)!;
    const json = JSON.stringify(payload);
    expect(json).not.toContain("owner_member_id");
    expect(json).not.toContain("token_hash");
    expect(json).not.toContain("growth_opportunity");
    expect(json).not.toContain("0911111111");
    expect(payload.measurementDeltaSummary).toBeNull();
    expect(payload.introducerDisplayName).toBeNull();
    expect(payload.shareText).toBe("精神比較好");
  });

  it("RF-12 — B submits interest", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: true,
        showDayCount: true,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    const result = store.submitFriend({
      token: activated.plaintextToken,
      displayName: "陳小華",
      phone: "0922222222",
      goalText: "想改善體態",
    });
    expect(result.attribution.leadDisplayName).toBe("陳小華");
    expect(result.attribution.status).toBe("customer_created");
  });

  it("RF-13 — attribution A→B persisted", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    const result = store.submitFriend({
      token: activated.plaintextToken,
      displayName: "陳小華",
      phone: "0922222222",
    });
    expect(result.attribution.introducerCustomerId).toBe(CUSTOMER_A);
    expect(result.attribution.introducedCustomerId).toBeTruthy();
  });

  it("RF-14 — B converts to Customer", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    const before = store.customers.length;
    const result = store.submitFriend({
      token: activated.plaintextToken,
      displayName: "陳小華",
      phone: "0922222222",
    });
    expect(result.createdNew).toBe(true);
    expect(store.customers.length).toBe(before + 1);
    expect(store.customers.at(-1)?.ownerMemberId).toBe(OWNER);
  });

  it("RF-15 — attribution survives conversion", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    const result = store.submitFriend({
      token: activated.plaintextToken,
      displayName: "陳小華",
      phone: "0922222222",
    });
    const saved = store.attributions.find((row) => row.id === result.attribution.id);
    expect(saved?.introducedCustomerId).toBe(result.attribution.introducedCustomerId);
    expect(saved?.introducerCustomerId).toBe(CUSTOMER_A);
  });

  it("RF-16 — same-owner existing phone → link, no duplicate", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    store.addCustomer({
      id: "customer-b-existing",
      ownerMemberId: OWNER,
      displayName: "舊顧客B",
      phone: "0933333333",
    });
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    const before = store.customers.length;
    const result = store.submitFriend({
      token: activated.plaintextToken,
      displayName: "別名",
      phone: "0933-333-333",
    });
    expect(result.linkedExisting).toBe(true);
    expect(result.createdNew).toBe(false);
    expect(result.attribution.introducedCustomerId).toBe("customer-b-existing");
    expect(store.customers.length).toBe(before);
  });

  it("RF-17 — name-only → no unsafe merge", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    store.addCustomer({
      id: "customer-same-name",
      ownerMemberId: OWNER,
      displayName: "陳小華",
    });
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    // Production API rejects missing contact; memory engine still applies name-only policy.
    const decisionPath = store.submitFriend({
      token: activated.plaintextToken,
      displayName: "陳小華",
      phone: null,
      lineId: null,
    });
    expect(decisionPath.createdNew).toBe(false);
    expect(decisionPath.linkedExisting).toBe(false);
    expect(decisionPath.attribution.introducedCustomerId).toBeNull();
    expect(decisionPath.attribution.status).toBe("submitted");
  });

  it("RF-18 — cross-owner isolation", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    expect(store.ownerCanRead(OTHER, started.share.id)).toBe(false);
    expect(store.ownerCanRead(OWNER, started.share.id)).toBe(true);
  });

  it("RF-19 — anon direct table access denied", () => {
    const store = new GrowthLoopMemoryStore();
    expect(store.anonCanQueryTables()).toBe(false);
  });

  it("RF-20 — Customer portal cannot read Referral Center internals", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: true,
        showDayCount: true,
        showMeasurementDelta: false,
        shareText: "ok",
        measurementDeltaSummary: null,
      },
    });
    const payload = store.resolvePublic(activated.plaintextToken)!;
    expect(payload).not.toHaveProperty("metrics");
    expect(payload).not.toHaveProperty("suitable");
    expect(JSON.stringify(payload)).not.toContain("fingerprint");
    expect(JSON.stringify(payload)).not.toContain("readiness");
  });

  it("RF-21 — Rescue > Growth pauses active share", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    store.applyRescuePause(CUSTOMER_A, true);
    expect(store.shares.find((row) => row.id === started.share.id)?.status).toBe("paused");
    expect(store.resolvePublic(activated.plaintextToken)?.acceptsNewReferral).toBe(false);
  });

  it("RF-22 — declined / cooldown respected", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    store.customerDecline(started.share.id, CUSTOMER_A);
    expect(store.shares[0]?.status).toBe("declined");
    expect(store.opportunities[0]?.status).toBe("declined");
    const eligibility = assessShareStartEligibility({
      opportunity: {
        id: "opp-1",
        status: "declined",
        primaryGrowthPath: "coach_assisted_referral",
        secondaryPathsJson: [],
        readiness: "strong",
      },
    });
    expect(eligibility.canStart).toBe(false);
  });

  it("RF-23 — share can be revoked", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    store.revoke(started.share.id, OWNER);
    expect(store.shares[0]?.status).toBe("revoked");
  });

  it("RF-24 — revoked share rejects new B", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    store.revoke(started.share.id, OWNER);
    expect(() =>
      store.submitFriend({
        token: activated.plaintextToken,
        displayName: "新朋友",
        phone: "0944444444",
      }),
    ).toThrow(/not_accepting/);
  });

  it("RF-25 — friend benefit has no fake Herbalife discount", () => {
    expect(FRIEND_BENEFIT_DEFAULT.benefitLabel).toBe("朋友專屬體驗");
    expect(FRIEND_BENEFIT_DEFAULT.benefitLabel).not.toMatch(/折扣|折價|VP|賀寶芙官方/);
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const { share } = store.coachStart({
      ownerMemberId: OWNER,
      opportunityId: "opp-1",
      shareType: "friend_benefit",
    });
    expect(share.benefit.benefitLabel).toBe("朋友專屬體驗");
    expect(JSON.stringify(share.benefit)).not.toMatch(/折扣|Herbalife pricing/i);
  });

  it("RF-26 — metrics deterministic", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    store.submitFriend({
      token: activated.plaintextToken,
      displayName: "陳小華",
      phone: "0922222222",
    });
    const metrics = store.metrics();
    expect(metrics.activeShareCustomerCount).toBe(1);
    expect(metrics.sharesCreatedThisMonth).toBe(1);
    expect(metrics.interestedFriendsThisMonth).toBe(1);
    expect(metrics.newCustomersThisMonth).toBe(1);
  });

  it("RF-27 — no OpenAI needed for referral attribution", () => {
    const store = new GrowthLoopMemoryStore();
    seedStrongOpportunity(store);
    const started = store.coachStart({ ownerMemberId: OWNER, opportunityId: "opp-1" });
    const activated = store.customerConsent({
      customerId: CUSTOMER_A,
      shareId: started.share.id,
      displayName: "王小美",
      consent: {
        showIntroducerName: false,
        showDayCount: false,
        showMeasurementDelta: false,
        shareText: null,
        measurementDeltaSummary: null,
      },
    });
    // Pure deterministic path — no AI imports required
    const result = store.submitFriend({
      token: activated.plaintextToken,
      displayName: "陳小華",
      phone: "0955555555",
    });
    expect(result.attribution.id).toBeTruthy();
  });

  it("RF-28 — Phase 2f authority unchanged (outcome status not rewritten by share)", () => {
    const outcome = makeOutcomeSignal({
      outcomeStatus: "improving",
      measurementStage: "trend_available",
    });
    const matrix = evaluateGrowthMatrix({
      outcomeSignal: outcome,
      evaluatingMemberId: OWNER,
      checkin: makeCheckin(),
      asOfIso: "2026-08-12T12:00:00.000Z",
    });
    expect(matrix.outcomeSignal.outcomeStatus).toBe("improving");
    expect(matrix.outcomeSignal.measurementStage).toBe("trend_available");
  });

  it("RF-29 — Phase 3 Attention regression (coach_attention blocks Growth)", () => {
    const matrix = evaluateGrowthMatrix({
      outcomeSignal: makeOutcomeSignal({
        outcomeStatus: "improving",
        measurementStage: "trend_available",
        attentionTier: "coach_attention",
        finalInterventionLevel: "coach_attention",
      }),
      evaluatingMemberId: OWNER,
      checkin: makeCheckin(),
      asOfIso: "2026-08-12T12:00:00.000Z",
    });
    expect(matrix.shouldOpen).toBe(false);
    expect(matrix.blockedReasons.length).toBeGreaterThan(0);
  });

  it("RF-30 — Phase 4e Growth regression (high×high still strong)", () => {
    const matrix = evaluateGrowthMatrix({
      outcomeSignal: makeOutcomeSignal({
        outcomeStatus: "improving",
        measurementStage: "trend_available",
      }),
      evaluatingMemberId: OWNER,
      checkin: makeCheckin({
        outcomePerception: 5,
        experienceSatisfaction: 5,
        recommendationWillingness: 9,
        explicitReferralIntent: true,
      }),
      asOfIso: "2026-08-12T12:00:00.000Z",
    });
    expect(matrix.readiness).toBe("strong");
    expect(matrix.primaryGrowthPath).toBeTruthy();
  });
});
