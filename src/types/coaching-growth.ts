/** Phase 4e — Customer Experience × Growth Intelligence types. */

import type {
  OutcomeSignal,
  ReferralBlockReasonCode,
  ReferralCelebrationClass,
  ReferralOpportunityEvaluation,
  ReferralOpportunityRecord,
  ReferralReadinessLevel,
  ReferralSupportingSignalCode,
} from "@/types/coaching-referral";

export const GROWTH_PATHS = [
  "coach_assisted_referral",
  "social_proof",
  "friend_benefit",
] as const;
export type GrowthPath = (typeof GROWTH_PATHS)[number];

export const OUTCOME_BANDS = ["blocked", "low", "mid", "high"] as const;
export type OutcomeBand = (typeof OUTCOME_BANDS)[number];

export const EXPERIENCE_BANDS = ["unknown", "struggle", "low", "mid", "high"] as const;
export type ExperienceBand = (typeof EXPERIENCE_BANDS)[number];

export const CHECKIN_TRIGGER_REASONS = [
  "scheduled",
  "post_measurement",
  "milestone",
  "coach_invite",
  "recheck",
  "major_breakthrough",
] as const;
export type CheckinTriggerReason = (typeof CHECKIN_TRIGGER_REASONS)[number];

export const FELT_CHANGE_CONSENTS = ["coach_only", "share_ok"] as const;
export type FeltChangeConsent = (typeof FELT_CHANGE_CONSENTS)[number];

export const EXPERIENCE_CHECKIN_POLICY = {
  minGapMs: 14 * 24 * 60 * 60 * 1000,
  afterDeclineMs: 30 * 24 * 60 * 60 * 1000,
  afterCompletedRecheckMs: 21 * 24 * 60 * 60 * 1000,
  coachInviteSoftCapMs: 7 * 24 * 60 * 60 * 1000,
  /** Experience high thresholds (Business Rules). */
  highPerceptionMin: 4,
  highSatisfactionMin: 4,
  highWillingnessMin: 8,
  lowAxisMax: 2,
  socialProofWillingnessMin: 7,
} as const;

export type CustomerExperienceCheckin = {
  id: string;
  ownerMemberId: string;
  customerId: string;
  enrollmentId: string | null;
  triggerReason: CheckinTriggerReason;
  asOfLogDate: string;
  outcomePerception: number | null;
  coachHelpfulness: number | null;
  experienceSatisfaction: number | null;
  recommendationWillingness: number | null;
  mostFeltChangeText: string | null;
  mostFeltChangeConsent: FeltChangeConsent;
  explicitReferralIntent: boolean;
  struggleFlag: boolean;
  declineGrowthAsk: boolean;
  source: "portal" | "in_app_future" | "coach_assisted_capture";
  respondedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type GrowthMatrixResult = {
  outcomeBand: OutcomeBand;
  experienceBand: ExperienceBand;
  readiness: ReferralReadinessLevel;
  blockedReasons: ReferralBlockReasonCode[];
  supportingSignals: ReferralSupportingSignalCode[];
  primaryGrowthPath: GrowthPath | null;
  secondaryEligiblePaths: GrowthPath[];
  celebrationClass: ReferralCelebrationClass;
  pathway: ReferralOpportunityEvaluation["pathway"];
  fingerprint: string;
  shouldOpen: boolean;
  majorBreakthrough: boolean;
  repairExperience: boolean;
  inviteCheckin: boolean;
  outcomeSignal: OutcomeSignal;
  checkinId: string | null;
  /** Coach-facing why lines — deterministic, not AI prose. */
  whyEvidence: string[];
};

export type GrowthOpportunityRecord = ReferralOpportunityRecord & {
  outcomeBandSnapshot: string;
  experienceBandSnapshot: string;
  primaryGrowthPath: GrowthPath | null;
  secondaryPathsJson: GrowthPath[];
  sourceCheckinId: string | null;
};

export function isGrowthPath(value: string): value is GrowthPath {
  return (GROWTH_PATHS as readonly string[]).includes(value);
}

export function isCheckinTriggerReason(value: string): value is CheckinTriggerReason {
  return (CHECKIN_TRIGGER_REASONS as readonly string[]).includes(value);
}
