/**
 * In-memory Growth Loop engine for Phase 4f deterministic tests.
 * Mirrors production rules without Supabase / OpenAI.
 */

import { evaluateGrowthMatrix } from "@/lib/coaching/growth/evaluate-growth-matrix";
import { extractCustomerConfirmedExperience } from "@/lib/coaching/referral/extract-customer-confirmed-experience";
import {
  computeReferralCenterMetrics,
  decideFriendBConversion,
} from "@/lib/coaching/referral-share/conversion-policy";
import {
  buildDefaultBenefit,
  buildPublicDisplayFromConsent,
  toPublicSharePayload,
} from "@/lib/coaching/referral-share/public-payload";
import {
  assessShareStartEligibility,
  isShareAcceptingReferrals,
  shouldPauseSharesForRescue,
} from "@/lib/coaching/referral-share/share-eligibility";
import {
  generateGrowthShareToken,
  hashGrowthShareToken,
  isPlausibleGrowthShareToken,
} from "@/lib/coaching/referral-share/share-token";
import type { CustomerExperienceCheckin } from "@/types/coaching-growth";
import type { OutcomeSignal } from "@/types/coaching-referral";
import type {
  GrowthShareConsentSnapshot,
  GrowthShareRecord,
  GrowthShareType,
  PublicSharePayload,
  ReferralAttributionRecord,
} from "@/types/coaching-referral-share";
import { randomUUID } from "node:crypto";

export type MemoryCustomer = {
  id: string;
  ownerMemberId: string;
  displayName: string;
  phone?: string | null;
  lineId?: string | null;
};

export type MemoryOpportunity = {
  id: string;
  ownerMemberId: string;
  customerId: string;
  enrollmentId: string | null;
  status: "open" | "acted" | "snoozed" | "declined" | "converted" | "expired" | "superseded";
  readiness: "emerging" | "strong" | "not_ready";
  primaryGrowthPath: "coach_assisted_referral" | "social_proof" | "friend_benefit" | null;
  secondaryPathsJson: Array<"coach_assisted_referral" | "social_proof" | "friend_benefit">;
};

type ShareRow = GrowthShareRecord & { plaintextToken?: string };

export function makeOutcomeSignal(
  partial: Partial<OutcomeSignal> & Pick<OutcomeSignal, "outcomeStatus" | "measurementStage">,
): OutcomeSignal {
  return {
    customerId: partial.customerId ?? "customer-a",
    enrollmentId: partial.enrollmentId ?? "enrollment-1",
    ownerMemberId: partial.ownerMemberId ?? "owner-1",
    asOfLogDate: partial.asOfLogDate ?? "2026-08-12",
    trendStatus: partial.trendStatus ?? "not_applicable",
    goalType: partial.goalType ?? "fat_loss",
    customerSummary: partial.customerSummary ?? "fixture",
    evidence: partial.evidence ?? [],
    bodyQualityFlags: partial.bodyQualityFlags ?? [],
    attentionTier: partial.attentionTier ?? "routine",
    attentionReasonCodes: partial.attentionReasonCodes ?? [],
    finalInterventionLevel: partial.finalInterventionLevel ?? "normal",
    daysSinceEnrollmentStart: partial.daysSinceEnrollmentStart ?? 30,
    latestMeasurementId: partial.latestMeasurementId ?? "m-latest",
    baselineMeasurementId: partial.baselineMeasurementId ?? "m-base",
    celebrationClass: partial.celebrationClass ?? "clear",
    customerConfirmed: partial.customerConfirmed ?? extractCustomerConfirmedExperience(null),
    outcomeStatus: partial.outcomeStatus,
    measurementStage: partial.measurementStage,
  };
}

export function makeCheckin(partial: Partial<CustomerExperienceCheckin> = {}): CustomerExperienceCheckin {
  return {
    id: "checkin-1",
    ownerMemberId: "owner-1",
    customerId: "customer-a",
    enrollmentId: "enrollment-1",
    triggerReason: "milestone",
    asOfLogDate: "2026-08-12",
    outcomePerception: 5,
    coachHelpfulness: 5,
    experienceSatisfaction: 5,
    recommendationWillingness: 9,
    mostFeltChangeText: "精神變好",
    mostFeltChangeConsent: "share_ok",
    explicitReferralIntent: true,
    struggleFlag: false,
    declineGrowthAsk: false,
    source: "portal",
    respondedAt: "2026-08-12T00:00:00.000Z",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    ...partial,
  };
}

export class GrowthLoopMemoryStore {
  customers: MemoryCustomer[] = [];
  opportunities: MemoryOpportunity[] = [];
  shares: ShareRow[] = [];
  attributions: ReferralAttributionRecord[] = [];
  /** Simulate RLS: anon cannot read these tables */
  anonDenied = true;

  addCustomer(customer: MemoryCustomer) {
    this.customers.push(customer);
  }

  addOpportunity(opportunity: MemoryOpportunity) {
    this.opportunities.push(opportunity);
  }

  evaluateEligibility(input: {
    ownerMemberId: string;
    outcome: OutcomeSignal;
    checkin: CustomerExperienceCheckin | null;
  }) {
    return evaluateGrowthMatrix({
      outcomeSignal: input.outcome,
      evaluatingMemberId: input.ownerMemberId,
      checkin: input.checkin,
      asOfIso: "2026-08-12T12:00:00.000Z",
    });
  }

  coachStart(input: {
    ownerMemberId: string;
    opportunityId: string;
    shareType?: GrowthShareType | null;
  }): { share: ShareRow; plaintextToken: string } {
    const opportunity = this.opportunities.find(
      (row) => row.id === input.opportunityId && row.ownerMemberId === input.ownerMemberId,
    );
    if (!opportunity) throw new Error("blocked");
    const eligibility = assessShareStartEligibility({
      opportunity: {
        id: opportunity.id,
        status: opportunity.status,
        primaryGrowthPath: opportunity.primaryGrowthPath,
        secondaryPathsJson: opportunity.secondaryPathsJson,
        readiness: opportunity.readiness === "not_ready" ? "emerging" : opportunity.readiness,
      },
      requestedShareType: input.shareType ?? null,
    });
    if (!eligibility.canStart || !eligibility.shareType) throw new Error(eligibility.blockedReason ?? "blocked");

    const plaintextToken = generateGrowthShareToken();
    const now = "2026-08-12T12:00:00.000Z";
    const consent: GrowthShareConsentSnapshot = {
      consentedAt: null,
      consentedBy: null,
      showIntroducerName: false,
      showDayCount: true,
      showMeasurementDelta: false,
      shareText: null,
      measurementDeltaSummary: null,
    };
    const share: ShareRow = {
      id: randomUUID(),
      ownerMemberId: input.ownerMemberId,
      introducerCustomerId: opportunity.customerId,
      enrollmentId: opportunity.enrollmentId,
      growthOpportunityId: opportunity.id,
      shareType: eligibility.shareType,
      tokenHash: hashGrowthShareToken(plaintextToken),
      status: "pending_consent",
      consentSnapshot: consent,
      publicDisplay: buildPublicDisplayFromConsent({
        shareType: eligibility.shareType,
        consent,
        introducerDisplayName: null,
        dayCount: 30,
      }),
      benefit: buildDefaultBenefit(eligibility.shareType),
      customerDeclinedAt: null,
      activatedAt: null,
      revokedAt: null,
      pausedAt: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      plaintextToken,
    };
    this.shares.push(share);
    opportunity.status = "acted";
    return { share, plaintextToken };
  }

  customerConsent(input: {
    customerId: string;
    shareId: string;
    consent: Omit<GrowthShareConsentSnapshot, "consentedAt" | "consentedBy">;
    displayName: string | null;
  }): { share: ShareRow; plaintextToken: string; payload: PublicSharePayload } {
    const share = this.shares.find(
      (row) => row.id === input.shareId && row.introducerCustomerId === input.customerId,
    );
    if (!share) throw new Error("missing_share");
    if (share.status !== "pending_consent" && share.status !== "active") throw new Error("cannot_activate");

    const plaintextToken = generateGrowthShareToken();
    const now = "2026-08-12T12:05:00.000Z";
    const consent: GrowthShareConsentSnapshot = {
      ...input.consent,
      consentedAt: now,
      consentedBy: "customer",
    };
    share.consentSnapshot = consent;
    share.publicDisplay = buildPublicDisplayFromConsent({
      shareType: share.shareType,
      consent,
      introducerDisplayName: input.displayName,
      dayCount: 30,
    });
    share.tokenHash = hashGrowthShareToken(plaintextToken);
    share.plaintextToken = plaintextToken;
    share.status = "active";
    share.activatedAt = now;
    share.updatedAt = now;
    return {
      share,
      plaintextToken,
      payload: toPublicSharePayload({
        shareId: share.id,
        shareType: share.shareType,
        publicDisplay: share.publicDisplay,
        benefit: share.benefit,
        acceptsNewReferral: true,
      }),
    };
  }

  customerDecline(shareId: string, customerId: string) {
    const share = this.shares.find(
      (row) => row.id === shareId && row.introducerCustomerId === customerId,
    );
    if (!share) throw new Error("missing");
    share.status = "declined";
    share.customerDeclinedAt = "2026-08-12T12:10:00.000Z";
    const opportunity = this.opportunities.find((row) => row.id === share.growthOpportunityId);
    if (opportunity) opportunity.status = "declined";
  }

  resolvePublic(token: string, asOfMs = Date.parse("2026-08-12T13:00:00.000Z")): PublicSharePayload | null {
    if (!isPlausibleGrowthShareToken(token)) return null;
    const hash = hashGrowthShareToken(token);
    const share = this.shares.find((row) => row.tokenHash === hash);
    if (!share) return null;
    const accepts = isShareAcceptingReferrals({
      status: share.status,
      expiresAt: share.expiresAt,
      asOfMs,
    });
    return toPublicSharePayload({
      shareId: share.id,
      shareType: share.shareType,
      publicDisplay: share.publicDisplay,
      benefit: share.benefit,
      acceptsNewReferral: accepts,
    });
  }

  submitFriend(input: {
    token: string;
    displayName: string;
    phone?: string | null;
    lineId?: string | null;
    goalText?: string | null;
    asOfMs?: number;
  }) {
    const asOfMs = input.asOfMs ?? Date.parse("2026-08-12T13:00:00.000Z");
    const payload = this.resolvePublic(input.token, asOfMs);
    if (!payload) throw new Error("invalid_token");
    if (!payload.acceptsNewReferral) throw new Error("not_accepting");

    const hash = hashGrowthShareToken(input.token);
    const share = this.shares.find((row) => row.tokenHash === hash)!;
    const decision = decideFriendBConversion({
      ownerMemberId: share.ownerMemberId,
      leadDisplayName: input.displayName,
      leadPhone: input.phone,
      leadLineId: input.lineId,
      existingCustomers: this.customers.filter((c) => c.ownerMemberId === share.ownerMemberId),
    });

    let introducedCustomerId: string | null = null;
    let linkedExisting = false;
    let createdNew = false;
    let status: ReferralAttributionRecord["status"] = "submitted";

    if (decision.action === "link_existing") {
      introducedCustomerId = decision.customerId;
      linkedExisting = true;
      status = "customer_created";
    } else if (decision.action === "create_new") {
      const id = randomUUID();
      this.customers.push({
        id,
        ownerMemberId: share.ownerMemberId,
        displayName: input.displayName,
        phone: input.phone ?? null,
        lineId: input.lineId ?? null,
      });
      introducedCustomerId = id;
      createdNew = true;
      status = "customer_created";
      const opportunity = this.opportunities.find((row) => row.id === share.growthOpportunityId);
      if (opportunity) opportunity.status = "converted";
    }

    const now = new Date(asOfMs).toISOString();
    const attribution: ReferralAttributionRecord = {
      id: randomUUID(),
      ownerMemberId: share.ownerMemberId,
      shareId: share.id,
      introducerCustomerId: share.introducerCustomerId,
      introducedCustomerId,
      status,
      leadDisplayName: input.displayName,
      leadPhone: input.phone ?? null,
      leadLineId: input.lineId ?? null,
      leadGoalText: input.goalText ?? null,
      linkedExistingCustomer: linkedExisting,
      coachHandledAt: null,
      firstTouchAt: now,
      interestedAt: now,
      submittedAt: now,
      convertedAt: introducedCustomerId ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    this.attributions.push(attribution);
    return { attribution, createdNew, linkedExisting };
  }

  revoke(shareId: string, ownerMemberId: string) {
    const share = this.shares.find(
      (row) => row.id === shareId && row.ownerMemberId === ownerMemberId,
    );
    if (!share) throw new Error("missing");
    share.status = "revoked";
    share.revokedAt = "2026-08-12T14:00:00.000Z";
  }

  applyRescuePause(customerId: string, growthBlocked: boolean) {
    for (const share of this.shares) {
      if (share.introducerCustomerId !== customerId) continue;
      if (shouldPauseSharesForRescue({ growthBlocked, shareStatus: share.status })) {
        share.status = "paused";
        share.pausedAt = "2026-08-12T14:30:00.000Z";
      }
    }
  }

  metrics(asOfIso = "2026-08-12T15:00:00.000Z") {
    return computeReferralCenterMetrics({
      asOfIso,
      shares: this.shares,
      attributions: this.attributions,
    });
  }

  ownerCanRead(ownerMemberId: string, shareId: string) {
    return this.shares.some((row) => row.id === shareId && row.ownerMemberId === ownerMemberId);
  }

  anonCanQueryTables() {
    return !this.anonDenied;
  }
}
