/**
 * QUIZ-AI-21 P2.3 — Hybrid Dynamic Analysis (program-owned contracts).
 * No LLM in this module. Confidence is internal-only (never shown to consumer).
 */

export const ANALYSIS_DYNAMIC_SCHEMA_VERSION = "analysis_intake_v2" as const;
export const ANALYSIS_ENGINE_VERSION = "analysis_engine_v1" as const;
export const ANALYSIS_ENGINE_META_KEY = "__engine" as const;

/** Stop rules — single source of truth. */
export const ANALYSIS_STOP = {
  min: 6,
  targetMin: 7,
  targetMax: 9,
  hardMax: 11,
} as const;

export type AnalysisSlotId =
  | "goal"
  | "motivation"
  | "stuck_pattern"
  | "eating_pattern"
  | "trigger_pattern"
  | "sleep_pattern"
  | "activity_pattern"
  | "life_context"
  | "commitment"
  | "support_preference"
  | "safety"
  | "body_context";

export type AnalysisSlotStatus = "unknown" | "partial" | "not_relevant" | "sufficient";
export type AnalysisSlotSource = "quiz" | "analysis_answer" | "derived";

export type AnalysisBranchId =
  | "emotional_eating"
  | "meal_rhythm"
  | "sleep_fatigue"
  | "time_work"
  | "consistency"
  | "motivation_identity"
  | "knowledge"
  | "support"
  | "body_context"
  | "safety";

export const ANALYSIS_SLOT_IDS: AnalysisSlotId[] = [
  "goal",
  "motivation",
  "stuck_pattern",
  "eating_pattern",
  "trigger_pattern",
  "sleep_pattern",
  "activity_pattern",
  "life_context",
  "commitment",
  "support_preference",
  "safety",
  "body_context",
];

export const ANALYSIS_BRANCH_IDS: AnalysisBranchId[] = [
  "emotional_eating",
  "meal_rhythm",
  "sleep_fatigue",
  "time_work",
  "consistency",
  "motivation_identity",
  "knowledge",
  "support",
  "body_context",
  "safety",
];

/** Front-loaded required slots — everyone is asked these first. */
export const ANALYSIS_FRONT_REQUIRED_SLOTS: AnalysisSlotId[] = ["goal", "motivation", "stuck_pattern"];

/** Back-loaded required slots — asked near completion. Safety is never skippable. */
export const ANALYSIS_BACK_REQUIRED_SLOTS: AnalysisSlotId[] = ["commitment", "safety"];

export const ANALYSIS_REQUIRED_SLOTS: AnalysisSlotId[] = [
  ...ANALYSIS_FRONT_REQUIRED_SLOTS,
  ...ANALYSIS_BACK_REQUIRED_SLOTS,
];

export const ANALYSIS_CONDITIONAL_SLOTS: AnalysisSlotId[] = [
  "eating_pattern",
  "trigger_pattern",
  "sleep_pattern",
  "activity_pattern",
  "life_context",
  "body_context",
  "support_preference",
];

export type AnalysisSlotState = {
  status: AnalysisSlotStatus;
  source: AnalysisSlotSource;
  /** 0–1 internal. Never render. */
  confidence: number;
  evidenceQuestionIds: string[];
};

export type AnalysisReflection = {
  id: string;
  templateId: string;
  kicker: string;
  text: string;
  /** Grounded snippets / option labels actually present in answers. */
  evidence: string[];
};

export type AnalysisQuizSignals = {
  primaryType: string | null;
  primaryGoal: string | null;
  readiness: string | null;
  actionHistoryLabels: string[];
};

export type AnalysisEngineState = {
  version: typeof ANALYSIS_ENGINE_VERSION;
  slots: Record<AnalysisSlotId, AnalysisSlotState>;
  branchScores: Record<AnalysisBranchId, number>;
  askedQuestionIds: string[];
  reflections: AnalysisReflection[];
  lastReflection: AnalysisReflection | null;
  currentQuestionId: string | null;
  completionReason: null | "sufficient" | "hard_max" | "safety_stop";
  quiz: AnalysisQuizSignals;
};

export type AnalysisNextStep =
  | {
      kind: "question";
      questionId: string;
      reflection: AnalysisReflection | null;
    }
  | {
      kind: "complete";
      reason: NonNullable<AnalysisEngineState["completionReason"]>;
      reflection: null;
    };

export type AnalysisMilestoneId = "goal" | "stuck" | "rhythm" | "report";

export type AnalysisMilestone = {
  id: AnalysisMilestoneId;
  label: string;
  done: boolean;
  active: boolean;
};

export function emptySlot(status: AnalysisSlotStatus = "unknown"): AnalysisSlotState {
  return { status, source: "derived", confidence: 0, evidenceQuestionIds: [] };
}

export function createEmptySlots(): Record<AnalysisSlotId, AnalysisSlotState> {
  return Object.fromEntries(ANALYSIS_SLOT_IDS.map((id) => [id, emptySlot()])) as Record<
    AnalysisSlotId,
    AnalysisSlotState
  >;
}

export function createEmptyBranchScores(): Record<AnalysisBranchId, number> {
  return Object.fromEntries(ANALYSIS_BRANCH_IDS.map((id) => [id, 0])) as Record<AnalysisBranchId, number>;
}
