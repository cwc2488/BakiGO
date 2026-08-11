import type { CoachingInterventionLevel } from "@/types/coaching-ai";

export const COACHING_SIGNAL_CATEGORIES = [
  "meal",
  "hydration",
  "sleep",
  "exercise",
  "reporting",
  "body_trend",
  "coach_directive",
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
] as const;

export type CoachingMealObservationSignal = (typeof COACHING_MEAL_OBSERVATION_SIGNALS)[number];

export type CoachingMealObservation = {
  mealSlot: "breakfast" | "lunch" | "dinner";
  observedFoods: string[];
  signals: CoachingMealObservationSignal[];
  evidenceText: string[];
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

export type CoachingDecisionContext = {
  signals: CoachingSignal[];
  positiveSignals: CoachingSignal[];
  priorities: CoachingPriority[];
  recurringIssue: CoachingIssue | null;
  improvedIssue: CoachingIssue | null;
  coachAttention: CoachingCoachAttentionDecision;
  finalInterventionLevel: CoachingInterventionLevel;
};

/** Continuity contract: priority[0] owns tomorrow_focus subject. */
export type CoachingTomorrowFocusContract = {
  subject: string | null;
  sourcePriorityRank: number | null;
  sourceSignalKey: string | null;
};
