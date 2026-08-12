/** Phase 4f — Growth share × referral attribution types. */

import type { GrowthPath } from "@/types/coaching-growth";

export const GROWTH_SHARE_TYPES = ["outcome_share", "coach_referral", "friend_benefit"] as const;
export type GrowthShareType = (typeof GROWTH_SHARE_TYPES)[number];

export const GROWTH_SHARE_STATUSES = [
  "pending_consent",
  "active",
  "paused",
  "revoked",
  "expired",
  "declined",
] as const;
export type GrowthShareStatus = (typeof GROWTH_SHARE_STATUSES)[number];

export const REFERRAL_ATTRIBUTION_STATUSES = [
  "visited",
  "interested",
  "submitted",
  "customer_created",
  "declined",
] as const;
export type ReferralAttributionStatus = (typeof REFERRAL_ATTRIBUTION_STATUSES)[number];

export const FRIEND_BENEFIT_DEFAULT = {
  benefitType: "friend_experience",
  benefitLabel: "朋友專屬體驗",
  optionalCode: null as string | null,
  activeFrom: null as string | null,
  activeUntil: null as string | null,
} as const;

export type FriendBenefitConfig = {
  benefitType: string;
  benefitLabel: string;
  optionalCode: string | null;
  activeFrom: string | null;
  activeUntil: string | null;
};

/** Privacy-first public display — never include raw health metrics. */
export type GrowthSharePublicDisplay = {
  showIntroducerName: boolean;
  introducerDisplayName: string | null;
  showDayCount: boolean;
  dayCount: number | null;
  shareText: string | null;
  showMeasurementDelta: boolean;
  /** Customer-confirmed summary only — never raw weight/fat/muscle numbers from auto-export. */
  measurementDeltaSummary: string | null;
  headline: string;
  bodyCopy: string;
};

export type GrowthShareConsentSnapshot = {
  consentedAt: string | null;
  consentedBy: "customer" | null;
  showIntroducerName: boolean;
  showDayCount: boolean;
  showMeasurementDelta: boolean;
  shareText: string | null;
  measurementDeltaSummary: string | null;
};

export type GrowthShareRecord = {
  id: string;
  ownerMemberId: string;
  introducerCustomerId: string;
  enrollmentId: string | null;
  growthOpportunityId: string | null;
  shareType: GrowthShareType;
  tokenHash: string;
  status: GrowthShareStatus;
  consentSnapshot: GrowthShareConsentSnapshot;
  publicDisplay: GrowthSharePublicDisplay;
  benefit: FriendBenefitConfig;
  customerDeclinedAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  pausedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReferralAttributionRecord = {
  id: string;
  ownerMemberId: string;
  shareId: string;
  introducerCustomerId: string;
  introducedCustomerId: string | null;
  status: ReferralAttributionStatus;
  leadDisplayName: string | null;
  leadPhone: string | null;
  leadLineId: string | null;
  leadGoalText: string | null;
  linkedExistingCustomer: boolean;
  coachHandledAt: string | null;
  firstTouchAt: string;
  interestedAt: string | null;
  submittedAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Safe payload for anonymous `/r/[token]` — no health / Growth / Coach internals. */
export type PublicSharePayload = {
  shareId: string;
  shareType: GrowthShareType;
  headline: string;
  bodyCopy: string;
  introducerDisplayName: string | null;
  dayCount: number | null;
  shareText: string | null;
  measurementDeltaSummary: string | null;
  benefitLabel: string | null;
  acceptsNewReferral: boolean;
};

export type ReferralCenterMetrics = {
  activeShareCustomerCount: number;
  sharesCreatedThisMonth: number;
  interestedFriendsThisMonth: number;
  newCustomersThisMonth: number;
};

export function isGrowthShareType(value: string): value is GrowthShareType {
  return (GROWTH_SHARE_TYPES as readonly string[]).includes(value);
}

export function isGrowthShareStatus(value: string): value is GrowthShareStatus {
  return (GROWTH_SHARE_STATUSES as readonly string[]).includes(value);
}

export function isReferralAttributionStatus(value: string): value is ReferralAttributionStatus {
  return (REFERRAL_ATTRIBUTION_STATUSES as readonly string[]).includes(value);
}

export function growthPathToShareType(path: GrowthPath | null | undefined): GrowthShareType | null {
  if (path === "social_proof") return "outcome_share";
  if (path === "coach_assisted_referral") return "coach_referral";
  if (path === "friend_benefit") return "friend_benefit";
  return null;
}

export function shareTypeToGrowthPath(shareType: GrowthShareType): GrowthPath {
  if (shareType === "outcome_share") return "social_proof";
  if (shareType === "coach_referral") return "coach_assisted_referral";
  return "friend_benefit";
}
