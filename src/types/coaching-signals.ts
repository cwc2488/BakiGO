import type { CoachingInterventionLevel } from "@/types/coaching-ai";

export const COACHING_SIGNAL_CATEGORIES = [
  "meal",
  "hydration",
  "sleep",
  "exercise",
  "reporting",
  "body_trend",
  "coach_directive",
  "customer_voice",
] as const;

export type CoachingSignalCategory = (typeof COACHING_SIGNAL_CATEGORIES)[number];

export const COACHING_SIGNAL_SEVERITIES = ["positive", "minor", "moderate", "high"] as const;

export type CoachingSignalSeverity = (typeof COACHING_SIGNAL_SEVERITIES)[number];

export const COACHING_SIGNAL_SOURCES = ["today", "rolling", "body", "coach_directive"] as const;

export type CoachingSignalSource = (typeof COACHING_SIGNAL_SOURCES)[number];

export const COACHING_SIGNAL_CONFIDENCES = ["deterministic", "vision_assisted"] as const;

export type CoachingSignalConfidence = (typeof COACHING_SIGNAL_CONFIDENCES)[number];

export type CoachingSignalEvidence = {
  key: string;
  value: string | number | boolean | null;
  label?: string;
};

export type CoachingSignal = {
  key: string;
  category: CoachingSignalCategory;
  severity: CoachingSignalSeverity;
  source: CoachingSignalSource;
  evidence: CoachingSignalEvidence[];
  confidence: CoachingSignalConfidence;
};

export const COACHING_MEAL_OBSERVATION_SIGNALS = [
  "sugary_drink",
  "low_protein",
  "fried_food",
  "high_sauce",
  "processed_food",
  "vegetable_low",
  "meal_skipped",
  "shake_dominant",
  "starch_concentrated",
] as const;

export type CoachingMealObservationSignal = (typeof COACHING_MEAL_OBSERVATION_SIGNALS)[number];

/**
 * Structured meal vision observation.
 * Observations may include uncertainties — never invent calories/macros.
 */
export type CoachingMealObservation = {
  mealSlot: "breakfast" | "lunch" | "dinner";
  observedFoods: string[];
  signals: CoachingMealObservationSignal[];
  evidenceText: string[];
  mealType?: string | null;
  visibleProteinSource?: boolean | null;
  visibleVegetables?: boolean | null;
  visibleCarbohydrate?: boolean | null;
  sugaryDrinkObserved?: boolean;
  friedOrHighOilCookingObserved?: boolean;
  shakeObserved?: boolean;
  solidFoodObserved?: boolean | null;
  /** True when only shake/person visible — does NOT prove no other food was eaten. */
  noOtherFoodVisible?: boolean;
  possibleIssues?: string[];
  uncertainties?: string[];
  confidence?: "high" | "medium" | "low";
  followUpQuestion?: string | null;
};

export const COACHING_CUSTOMER_VOICE_KEYS = [
  "hunger_reported",
  "sweet_craving_reported",
  "low_appetite_reported",
  "fatigue_reported",
  "late_night_eating_reported",
  "emotional_eating_reported",
  "difficulty_following_plan",
  "other_customer_concern",
] as const;

export type CoachingCustomerVoiceKey = (typeof COACHING_CUSTOMER_VOICE_KEYS)[number];

export type CoachingCustomerVoiceSignal = {
  key: CoachingCustomerVoiceKey;
  rawExcerpt: string;
  evidence: CoachingSignalEvidence[];
};

export type CoachingPriority = {
  signalKey: string;
  rank: number;
  reason: string;
  evidence: CoachingSignalEvidence[];
  /** Deterministic subject for tomorrow_focus continuity — LLM may rephrase tone, not topic. */
  tomorrowFocusSubject: string;
};

export type CoachingIssue = {
  key: string;
  label: string;
  evidence: CoachingSignalEvidence[];
  sourceSignalKeys: string[];
};

export type CoachingCoachAttentionDecision = {
  required: boolean;
  reason: string | null;
  evidence: CoachingSignalEvidence[];
};

export type CoachingFollowUpMemory = {
  subject: string;
  question: string;
  sourceLogDate: string;
  status: "pending" | "resolved" | "improved";
};

export type CoachingPhotoReuseDetection = {
  suspected: boolean;
  similarityScore: number;
  matchedLogDate: string | null;
  matchedMealSlot: "breakfast" | "lunch" | "dinner" | null;
  method: "sha256" | "phash" | "none";
  mealSlot: "breakfast" | "lunch" | "dinner";
};

export type CoachingDecisionContext = {
  signals: CoachingSignal[];
  positiveSignals: CoachingSignal[];
  priorities: CoachingPriority[];
  recurringIssue: CoachingIssue | null;
  improvedIssue: CoachingIssue | null;
  coachAttention: CoachingCoachAttentionDecision;
  finalInterventionLevel: CoachingInterventionLevel;
  customerVoice: CoachingCustomerVoiceSignal[];
  mealObservations: CoachingMealObservation[];
  photoReuse: CoachingPhotoReuseDetection[];
  pendingFollowUps: CoachingFollowUpMemory[];
};

/** Continuity contract: priority[0] owns tomorrow_focus subject. */
export type CoachingTomorrowFocusContract = {
  subject: string | null;
  sourcePriorityRank: number | null;
  sourceSignalKey: string | null;
};
