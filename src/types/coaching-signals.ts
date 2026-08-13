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

export const COACHING_DAILY_NUTRITION_ASSESSMENT_LEVELS = [
  "on_track",
  "needs_adjustment",
  "off_track",
  "insufficient_data",
] as const;

export type CoachingDailyNutritionAssessmentLevel =
  (typeof COACHING_DAILY_NUTRITION_ASSESSMENT_LEVELS)[number];

export type CoachingDailyNutritionAssessment = {
  level: CoachingDailyNutritionAssessmentLevel;
  evidence: CoachingSignalEvidence[];
  reasons: string[];
  positiveFactors: string[];
  adjustmentSubjects: string[];
  confidence: number;
};

/** Deterministic customer-facing meal clarification budget for one log_date. */
export type CoachingMealFollowUpBudget = {
  maxCustomerMealClarifications: 1;
  selectedMealSlot: "breakfast" | "lunch" | "dinner" | null;
  selectedQuestion: string | null;
  suppressedMealSlots: Array<"breakfast" | "lunch" | "dinner">;
  /** Day-level consolidated ask when multiple meals share the same uncertainty family. */
  consolidatedQuestion: string | null;
  allowCustomerMealClarification: boolean;
};

/** Plan-aware shake allowance per meal slot (from enrollment plan_snapshot_json). */
export type CoachingMealPlanContext = {
  breakfastAllowsShake: boolean;
  lunchAllowsShake: boolean;
  dinnerAllowsShake: boolean;
};


export const COACHING_MEASUREMENT_STAGES = [
  "baseline_only",
  "comparison_available",
  "trend_available",
] as const;

export type CoachingMeasurementStage = (typeof COACHING_MEASUREMENT_STAGES)[number];

export const COACHING_OUTCOME_STATUSES = [
  "not_yet_measurable",
  "improving",
  "mixed",
  "flat",
  "worsening",
  "insufficient_data",
] as const;

export type CoachingOutcomeStatus = (typeof COACHING_OUTCOME_STATUSES)[number];

export const COACHING_TREND_STATUSES = [
  "not_applicable",
  "improving",
  "mixed",
  "flat",
  "worsening",
  "insufficient_data",
] as const;

export type CoachingTrendStatus = (typeof COACHING_TREND_STATUSES)[number];

export type CoachingGoalContext = {
  goalType: string;
  goalLabel: string;
  measurementStage: CoachingMeasurementStage;
  baselineDate: string | null;
  latestMeasurementDate: string | null;
  measurementCount: number;
  daysSinceBaseline: number | null;
  daysSinceLatestMeasurement: number | null;
  daysSinceEnrollmentStart: number;
  goalRelevantMetrics: string[];
};

export type CoachingMeasurementComparison = {
  baseline: import("@/types/coaching-ai").CoachingBodyMeasurementSummary;
  latest: import("@/types/coaching-ai").CoachingBodyMeasurementSummary;
  deltas: import("@/types/coaching-ai").CoachingBodyTrendDelta[];
  interpretation: CoachingOutcomeStatus;
  reasons: string[];
  evidence: CoachingSignalEvidence[];
};

export type CoachingOutcomeAssessment = {
  goalContext: CoachingGoalContext;
  comparison: CoachingMeasurementComparison | null;
  outcomeStatus: CoachingOutcomeStatus;
  trendStatus: CoachingTrendStatus;
  periods: Array<{
    fromDate: string;
    toDate: string;
    status: CoachingOutcomeStatus;
    spanDays: number;
  }>;
  reasons: string[];
  evidence: CoachingSignalEvidence[];
  customerSummary: string;
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
  dailyNutritionAssessment: CoachingDailyNutritionAssessment;
  mealFollowUpBudget: CoachingMealFollowUpBudget;
  mealPlanContext: CoachingMealPlanContext;
  goalContext: CoachingGoalContext;
  outcomeAssessment: CoachingOutcomeAssessment;
  /** Deterministic bowel signal (non-diagnostic). */
  bowelSignal?: {
    level: "normal" | "elevated_today" | "repeated_elevated";
    todayCount: number | null;
    coachCopy: string | null;
    customerCopy: string | null;
    suggestProfessionalCare: boolean;
  } | null;
  /** Deterministic directive × meal verification results. */
  directiveVerifications?: Array<{
    directiveId: string;
    mealSlot: string;
    instructionText: string;
    status: "followed" | "possible_not_followed" | "unknown" | "ignored";
    customerCopy: string | null;
    coachCopy: string | null;
    reason: string;
  }>;
};

/** Continuity contract: priority[0] owns tomorrow_focus subject. */
export type CoachingTomorrowFocusContract = {
  subject: string | null;
  sourcePriorityRank: number | null;
  sourceSignalKey: string | null;
};
