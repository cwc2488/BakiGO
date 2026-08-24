/**
 * RADAR-FEEDBACK-01 — member evaluation evidence only.
 * Never feeds auto-learning, score, Top20, allocation, or exclusion.
 */

export const RADAR_FEEDBACK_VALUES = [
  "worth_developing",
  "not_worth_developing",
] as const;

export const RADAR_REJECTION_REASONS = [
  "not_self_need",
  "already_resolved",
  "peer_provider",
  "language_region_unfit",
  "ai_misunderstood",
  "other",
] as const;

export type RadarFeedbackValue = (typeof RADAR_FEEDBACK_VALUES)[number];
export type RadarRejectionReason = (typeof RADAR_REJECTION_REASONS)[number];

/** Immutable snapshot of what Radar believed when the human evaluated. */
export type RadarFeedbackEvaluationContext = {
  pipeline_run_id: string | null;
  overall_score: number | null;
  recommendation_reason_shown: string | null;
  prompt_version: string | null;
  semantic_version: string | null;
  need_owner: string | null;
  need_state: string | null;
  market_role: string | null;
  need_category: string | null;
  urgency: string | null;
  help_seeking: string | null;
  primary_language: string | null;
  candidate_region: { city: string | null; district: string | null } | null;
  location_level: string | null;
};

export type MemberRadarRecommendationFeedback = {
  id: string;
  member_id: string;
  candidate_id: string;
  recommendation_date: string;
  feedback: RadarFeedbackValue;
  rejection_reason: RadarRejectionReason | null;
  optional_note: string | null;
  evaluation_context: RadarFeedbackEvaluationContext;
  created_at: string;
  updated_at: string;
};

export const REJECTION_REASON_LABEL_ZH: Record<RadarRejectionReason, string> = {
  not_self_need: "需求不是本人",
  already_resolved: "已經達成目標／需求已解決",
  peer_provider: "同行／主要是在提供服務",
  language_region_unfit: "語言／地區不適合",
  ai_misunderstood: "AI 理解錯誤",
  other: "其他",
};

export function isRadarFeedbackValue(value: string): value is RadarFeedbackValue {
  return (RADAR_FEEDBACK_VALUES as readonly string[]).includes(value);
}

export function isRadarRejectionReason(value: string): value is RadarRejectionReason {
  return (RADAR_REJECTION_REASONS as readonly string[]).includes(value);
}
