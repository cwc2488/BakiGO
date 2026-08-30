import type { EntityId, ISODateString } from "@/types";

/** Intensive AI coaching cycle length (product/cost boundary). */
export const COACHING_AI_V2_CYCLE_DAYS = 21 as const;

export const COACHING_AI_V2_PROMPT_VERSION = "coaching_ai_v3_current_turn_evidence_1" as const;

export const COACHING_AI_V2_POINT_KEY = "daily_coach_v2" as const;
export const COACHING_AI_V2_MEMORY_POINT_KEY = "coach_v2_memory_maintenance" as const;
export const COACHING_AI_V2_DAY21_POINT_KEY = "coach_v2_day21_reflection" as const;
export const COACHING_AI_V2_MESSAGE_POINT_KEY = "coach_v2_free_message" as const;

/** Bounded recent raw turns loaded into the coaching prompt. */
export const COACHING_AI_V2_RECENT_TURN_LIMIT = 12 as const;

/** Max active durable memory items injected per turn. */
export const COACHING_AI_V2_MEMORY_LIMIT = 16 as const;

/** Max open/waiting loops injected per turn. */
export const COACHING_AI_V2_OPEN_LOOP_LIMIT = 6 as const;

/** Max active hypotheses injected per turn. */
export const COACHING_AI_V2_HYPOTHESIS_LIMIT = 5 as const;

/** Soft-expire open loops older than this many days without resolution. */
export const COACHING_AI_V2_OPEN_LOOP_STALE_DAYS = 5 as const;

export const COACHING_AI_V2_CYCLE_STATUSES = ["active", "completed", "paused", "cancelled"] as const;
export type CoachingAiV2CycleStatus = (typeof COACHING_AI_V2_CYCLE_STATUSES)[number];

export const COACHING_AI_V2_LIFECYCLE_STAGES = [
  "understand",
  "find_patterns",
  "experiment",
  "build_autonomy",
  "day21_ending",
  "post_cycle",
] as const;
export type CoachingAiV2LifecycleStage = (typeof COACHING_AI_V2_LIFECYCLE_STAGES)[number];

export const COACHING_AI_V2_INTENTIONS = [
  "observe",
  "acknowledge",
  "investigate",
  "encourage",
  "educate",
  "challenge",
  "reinforce",
  "test_hypothesis",
  "follow_up",
  "detect_risk",
  "escalate",
  "casual",
  "reflect",
] as const;
export type CoachingAiV2Intention = (typeof COACHING_AI_V2_INTENTIONS)[number];

export const COACHING_AI_V2_MEMORY_CATEGORIES = [
  "constraint",
  "preference",
  "pattern",
  "motivation",
  "trigger",
  "strategy_worked",
  "strategy_failed",
  "communication",
  "customer_statement",
  "insight",
  "other",
] as const;
export type CoachingAiV2MemoryCategory = (typeof COACHING_AI_V2_MEMORY_CATEGORIES)[number];

export const COACHING_AI_V2_MEMORY_STATUSES = ["active", "superseded", "retracted"] as const;
export type CoachingAiV2MemoryStatus = (typeof COACHING_AI_V2_MEMORY_STATUSES)[number];

export const COACHING_AI_V2_OPEN_LOOP_STATUSES = ["open", "waiting", "resolved", "abandoned"] as const;
export type CoachingAiV2OpenLoopStatus = (typeof COACHING_AI_V2_OPEN_LOOP_STATUSES)[number];

export const COACHING_AI_V2_HYPOTHESIS_STATUSES = [
  "active",
  "weakened",
  "confirmed",
  "rejected",
  "revised",
] as const;
export type CoachingAiV2HypothesisStatus = (typeof COACHING_AI_V2_HYPOTHESIS_STATUSES)[number];

export const COACHING_AI_V2_TURN_ROLES = ["customer", "coach", "system"] as const;
export type CoachingAiV2TurnRole = (typeof COACHING_AI_V2_TURN_ROLES)[number];

export const COACHING_AI_V2_TURN_CHANNELS = [
  "daily_log",
  "free_message",
  "photo",
  "day21",
  "system",
] as const;
export type CoachingAiV2TurnChannel = (typeof COACHING_AI_V2_TURN_CHANNELS)[number];

export type CoachingAiV2Cycle = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  cycleIndex: number;
  startDate: ISODateString;
  plannedEndDate: ISODateString;
  status: CoachingAiV2CycleStatus;
  day21ReflectionId: EntityId | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachingAiV2MemoryItem = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  cycleId: EntityId | null;
  category: CoachingAiV2MemoryCategory;
  content: string;
  evidenceSummary: string | null;
  confidence: number;
  sourceLogDate: ISODateString | null;
  sourceTurnId: EntityId | null;
  status: CoachingAiV2MemoryStatus;
  createdAt: string;
  updatedAt: string;
};

export type CoachingAiV2OpenLoop = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  cycleId: EntityId | null;
  subject: string;
  detail: string;
  status: CoachingAiV2OpenLoopStatus;
  dueLogDate: ISODateString | null;
  createdLogDate: ISODateString | null;
  resolvedLogDate: ISODateString | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachingAiV2Hypothesis = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  cycleId: EntityId | null;
  statement: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  confidence: number;
  status: CoachingAiV2HypothesisStatus;
  revisedIntoId: EntityId | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachingAiV2Turn = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  cycleId: EntityId | null;
  logDate: ISODateString | null;
  turnIndex: number;
  role: CoachingAiV2TurnRole;
  channel: CoachingAiV2TurnChannel;
  content: string;
  contentSummary: string | null;
  aiOutputId: EntityId | null;
  intention: CoachingAiV2Intention | string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CoachingAiV2Day21Reflection = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  cycleId: EntityId;
  reflectionJson: CoachingAiV2Day21ReflectionJson;
  customerMessage: string;
  coachSummary: string | null;
  model: string | null;
  promptVersion: string | null;
  createdAt: string;
};

export type CoachingAiV2Day21ReflectionJson = {
  startingSituation: string;
  majorPatterns: string[];
  meaningfulChanges: string[];
  recurringDifficulties: string[];
  triggers: string[];
  experimentsAttempted: string[];
  whatWorked: string[];
  whatDidNot: string[];
  sustainable: string[];
  nextActions: string[];
};

export type CoachingAiV2LifecycleSnapshot = {
  cycle: CoachingAiV2Cycle | null;
  dayNumber: number | null;
  stage: CoachingAiV2LifecycleStage;
  intensiveActive: boolean;
  daysRemaining: number | null;
};

export type CoachingAiV2MemoryBundle = {
  recentTurns: CoachingAiV2Turn[];
  durableMemory: CoachingAiV2MemoryItem[];
  openLoops: CoachingAiV2OpenLoop[];
  hypotheses: CoachingAiV2Hypothesis[];
  lifecycle: CoachingAiV2LifecycleSnapshot;
};

export type CoachingAiV2MemoryWrite = {
  category: CoachingAiV2MemoryCategory;
  content: string;
  evidenceSummary?: string | null;
  confidence?: number;
};

export type CoachingAiV2OpenLoopOp =
  | {
      op: "create";
      subject: string;
      detail: string;
      dueLogDate?: ISODateString | null;
      status?: "open" | "waiting";
    }
  | {
      op: "resolve" | "abandon";
      id: EntityId;
      resolutionNote?: string | null;
    }
  | {
      op: "update";
      id: EntityId;
      detail?: string;
      dueLogDate?: ISODateString | null;
      status?: "open" | "waiting";
    };

export type CoachingAiV2HypothesisOp =
  | {
      op: "create";
      statement: string;
      supportingEvidence?: string[];
      confidence?: number;
    }
  | {
      op: "support" | "contradict";
      id: EntityId;
      evidence: string;
      confidence?: number;
    }
  | {
      op: "reject" | "confirm";
      id: EntityId;
      evidence?: string;
    }
  | {
      op: "revise";
      id: EntityId;
      statement: string;
      supportingEvidence?: string[];
      confidence?: number;
    };

export type CoachingAiV2GenerationMeta = {
  intention: CoachingAiV2Intention;
  lifecycleDay: number | null;
  lifecycleStage: CoachingAiV2LifecycleStage;
  memoryWrites: CoachingAiV2MemoryWrite[];
  openLoopOps: CoachingAiV2OpenLoopOp[];
  hypothesisOps: CoachingAiV2HypothesisOp[];
  safetyTriggered: boolean;
  escalationSuggested: boolean;
  escalationReason: string | null;
  day21Reflection: CoachingAiV2Day21ReflectionJson | null;
};

/** V2 freeform generation payload (internal + customer message). */
export type CoachingAiV2GenerationDraft = {
  coachMessage: string;
  meta: CoachingAiV2GenerationMeta;
};

export type CoachingAiV2Observability = {
  model: string;
  promptVersion: string;
  lifecycleDay: number | null;
  lifecycleStage: CoachingAiV2LifecycleStage;
  recentTurnsLoaded: number;
  durableMemoryLoaded: number;
  openLoopsLoaded: number;
  hypothesesLoaded: number;
  memoryUpdateOutcome: "applied" | "skipped" | "failed";
  safetyTriggered: boolean;
  escalationSuggested: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
};
