/**
 * RADAR-SEMANTIC-01 — structured candidate understanding.
 *
 * Topic signals are not enough. Eligibility is decided from ownership, journey
 * state, role, language, and evidence — not keyword frequency.
 */

export const NEED_OWNERS = ["self", "third_party", "general", "unknown"] as const;
export const NEED_STATES = [
  "unresolved",
  "in_progress_with_gap",
  "resolved",
  "none",
  "unknown",
] as const;
export const MARKET_ROLES = ["consumer", "provider", "mixed", "unknown"] as const;
export const NEED_CATEGORIES = [
  "fat_loss",
  "muscle_gain",
  "health",
  "income",
  "business",
  "other",
  "none",
] as const;
export const URGENCY_LEVELS = ["high", "medium", "low", "none", "unknown"] as const;
export const HELP_SEEKING_LEVELS = ["explicit", "implicit", "none", "unknown"] as const;
export const PRIMARY_LANGUAGES = [
  "zh-Hant",
  "zh-Hans",
  "ja",
  "ko",
  "en",
  "mixed",
  "unknown",
] as const;
export const TRADITIONAL_CHINESE_USABLE = ["true", "false", "uncertain"] as const;
export const REGION_CONFIDENCE_LEVELS = ["high", "medium", "low", "unknown"] as const;

export type NeedOwner = (typeof NEED_OWNERS)[number];
export type NeedState = (typeof NEED_STATES)[number];
export type MarketRole = (typeof MARKET_ROLES)[number];
export type NeedCategory = (typeof NEED_CATEGORIES)[number];
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];
export type HelpSeekingLevel = (typeof HELP_SEEKING_LEVELS)[number];
export type PrimaryLanguage = (typeof PRIMARY_LANGUAGES)[number];
export type TraditionalChineseUsable = (typeof TRADITIONAL_CHINESE_USABLE)[number];
export type RegionConfidence = (typeof REGION_CONFIDENCE_LEVELS)[number];

export type CandidateUnderstanding = {
  need_owner: NeedOwner;
  need_state: NeedState;
  market_role: MarketRole;
  need_category: NeedCategory;
  pain_points: string[];
  attempts: string[];
  unresolved_gap: string | null;
  urgency: UrgencyLevel;
  help_seeking: HelpSeekingLevel;
  evidence_confidence: number;
  primary_language: PrimaryLanguage;
  traditional_chinese_usable: TraditionalChineseUsable;
  candidate_region: { city: string | null; district: string | null } | null;
  region_confidence: RegionConfidence;
  region_evidence: string | null;
  recommendation_reason_zh: string | null;
};

export type SemanticEligibilityReason =
  | "legacy_no_understanding"
  | "self_unresolved_need"
  | "self_in_progress_with_gap"
  | "language_ineligible"
  | "language_unknown"
  | "third_party_need"
  | "general_topic"
  | "resolved_success"
  | "no_personal_need"
  | "provider_without_self_need"
  | "known_provider"
  | "known_mixed_provider"
  | "low_confidence";

export type SemanticEligibility = {
  eligible: boolean;
  reason: SemanticEligibilityReason;
  language_eligible: boolean;
  personal_need: boolean;
};

export function isLanguageEligible(input: {
  primary_language: PrimaryLanguage;
  traditional_chinese_usable: TraditionalChineseUsable;
}): boolean {
  if (input.primary_language === "zh-Hant") return true;
  if (input.primary_language === "mixed" && input.traditional_chinese_usable === "true") {
    return true;
  }
  return false;
}

export function hasPersonalConsumerNeed(understanding: CandidateUnderstanding): boolean {
  return (
    understanding.need_owner === "self" &&
    (understanding.need_state === "unresolved" ||
      understanding.need_state === "in_progress_with_gap")
  );
}

/**
 * Radar prospects consumers with an unresolved self need — not industry peers.
 *
 * Known provider / materially mixed provider-service activity is ineligible even
 * when the person also has a genuine personal weight/fitness goal. Unknown role
 * is not auto-excluded; consumer follows normal need/state evaluation.
 */
export function evaluateSemanticEligibility(
  understanding: CandidateUnderstanding | null | undefined,
): SemanticEligibility {
  if (!understanding) {
    return {
      eligible: true,
      reason: "legacy_no_understanding",
      language_eligible: true,
      personal_need: false,
    };
  }

  const language_eligible = isLanguageEligible(understanding);
  if (understanding.primary_language === "unknown") {
    return {
      eligible: false,
      reason: "language_unknown",
      language_eligible: false,
      personal_need: false,
    };
  }
  if (!language_eligible) {
    return {
      eligible: false,
      reason: "language_ineligible",
      language_eligible: false,
      personal_need: false,
    };
  }

  if (understanding.need_owner === "third_party") {
    return {
      eligible: false,
      reason: "third_party_need",
      language_eligible: true,
      personal_need: false,
    };
  }
  if (understanding.need_owner === "general") {
    return {
      eligible: false,
      reason: "general_topic",
      language_eligible: true,
      personal_need: false,
    };
  }
  if (understanding.need_state === "resolved") {
    return {
      eligible: false,
      reason: "resolved_success",
      language_eligible: true,
      personal_need: false,
    };
  }
  if (understanding.need_state === "none" || understanding.need_owner === "unknown") {
    return {
      eligible: false,
      reason: "no_personal_need",
      language_eligible: true,
      personal_need: false,
    };
  }

  // RADAR-PEER-QUALITY-02: peer/provider status wins over personal self-need.
  if (understanding.market_role === "provider") {
    return {
      eligible: false,
      reason: "known_provider",
      language_eligible: true,
      personal_need: false,
    };
  }
  if (understanding.market_role === "mixed") {
    return {
      eligible: false,
      reason: "known_mixed_provider",
      language_eligible: true,
      personal_need: false,
    };
  }

  if (understanding.evidence_confidence < 0.35) {
    return {
      eligible: false,
      reason: "low_confidence",
      language_eligible: true,
      personal_need: false,
    };
  }

  const personal_need =
    understanding.need_owner === "self" &&
    (understanding.need_state === "unresolved" ||
      understanding.need_state === "in_progress_with_gap");

  if (!personal_need) {
    return {
      eligible: false,
      reason: "no_personal_need",
      language_eligible: true,
      personal_need: false,
    };
  }

  return {
    eligible: true,
    reason:
      understanding.need_state === "in_progress_with_gap"
        ? "self_in_progress_with_gap"
        : "self_unresolved_need",
    language_eligible: true,
    personal_need: true,
  };
}

export function emptyUnderstanding(
  overrides: Partial<CandidateUnderstanding> = {},
): CandidateUnderstanding {
  return {
    need_owner: "unknown",
    need_state: "unknown",
    market_role: "unknown",
    need_category: "none",
    pain_points: [],
    attempts: [],
    unresolved_gap: null,
    urgency: "unknown",
    help_seeking: "unknown",
    evidence_confidence: 0,
    primary_language: "unknown",
    traditional_chinese_usable: "uncertain",
    candidate_region: null,
    region_confidence: "unknown",
    region_evidence: null,
    recommendation_reason_zh: null,
    ...overrides,
  };
}
