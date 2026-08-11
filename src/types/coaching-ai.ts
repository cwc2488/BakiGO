import type { EntityId, ISODateString } from "@/types";
import type { CoachingPlanSnapshot } from "@/types/coaching";

export const COACHING_AI_POINT_KEY = "daily_coach_generation" as const;

export type CoachingAiPointKey = typeof COACHING_AI_POINT_KEY;

export const COACHING_AI_OUTPUT_STATUSES = ["pending", "processing", "completed", "failed"] as const;

export type CoachingAiOutputStatus = (typeof COACHING_AI_OUTPUT_STATUSES)[number];

export const COACHING_GENERATION_JOB_STATUSES = ["queued", "processing", "completed", "failed"] as const;

export type CoachingGenerationJobStatus = (typeof COACHING_GENERATION_JOB_STATUSES)[number];

export const COACHING_INTERVENTION_LEVELS = ["normal", "watch", "coach_attention"] as const;

export type CoachingInterventionLevel = (typeof COACHING_INTERVENTION_LEVELS)[number];

export const COACHING_AI_INFERENCE_PROVENANCE = "ai_inference" as const;

export type CoachingAiInferenceProvenance = typeof COACHING_AI_INFERENCE_PROVENANCE;

export const COACHING_DETERMINISTIC_PROVENANCE = "deterministic" as const;

export type CoachingDeterministicProvenance = typeof COACHING_DETERMINISTIC_PROVENANCE;

export const COACHING_AI_SNAPSHOT_VERSION = 1 as const;

export const COACHING_GENERATION_INPUT_VERSION = 1 as const;

export const COACHING_DAILY_GENERATION_OUTPUT_VERSION = 1 as const;

export const COACHING_AI_PROMPT_VERSION = "coaching_daily_v1" as const;

export const COACHING_ROLLING_WINDOW_DAYS = 14 as const;

export const COACHING_RECENT_RAW_DAYS = 3 as const;

export const COACHING_AI_MAX_REGENERATIONS_PER_DAY = 2 as const;

/** Jobs stuck in processing longer than this may be reclaimed by a worker. */
export const COACHING_GENERATION_JOB_STALE_MS = 15 * 60 * 1000;

export type CoachingAiLlmFeature = "coaching" | "consultation" | "radar" | "quiz";

export type CoachingAiLlmCallStatus = "completed" | "failed";

// ---------------------------------------------------------------------------
// Daily generation output JSON (schema only — not generated in 2b-1)
// ---------------------------------------------------------------------------

export type CoachingDailyGenerationCustomerOutput = {
  encouragement: string;
  today_feedback: string;
  adjustment_priorities: string[];
  tomorrow_focus: string;
};

export type CoachingDailyGenerationCoachOutput = {
  daily_summary: string;
  recurring_issue: string | null;
  improved_issue: string | null;
  /** AI proposal for audit — authoritative level is final_intervention_level on row. */
  proposed_intervention_level: CoachingInterventionLevel;
  coach_attention_required: boolean;
  attention_reason: string | null;
  evidence: string[];
};

export type CoachingDailyGenerationOutputJson = {
  version: typeof COACHING_DAILY_GENERATION_OUTPUT_VERSION;
  customer: CoachingDailyGenerationCustomerOutput;
  coach: CoachingDailyGenerationCoachOutput;
};

// ---------------------------------------------------------------------------
// Prior AI memory (read from previous coaching_ai_outputs — not a separate table)
// ---------------------------------------------------------------------------

export type CoachingPriorAiInferenceField<T> = {
  value: T;
  provenance: CoachingAiInferenceProvenance;
  sourceOutputId: EntityId;
  sourceLogDate: ISODateString;
};

export type CoachingPriorAiContext = {
  logDate: ISODateString;
  tomorrowFocus: CoachingPriorAiInferenceField<string> | null;
  recurringIssue: CoachingPriorAiInferenceField<string> | null;
  improvedIssue: CoachingPriorAiInferenceField<string> | null;
};

export type CoachingInterventionContext = {
  finalInterventionLevel: CoachingInterventionLevel;
  reasons: string[];
  provenance: CoachingDeterministicProvenance;
};

// ---------------------------------------------------------------------------
// Generation input (Phase 2b-2 — sole package for daily AI inference)
// ---------------------------------------------------------------------------

export type CoachingGenerationProfileMemory = {
  displayName: string;
  goal: string | null;
  daysSinceEnrollmentStart: number;
  planSnapshot: CoachingPlanSnapshot;
  customerContext: {
    heightCm: number | null;
    sex: string | null;
    region: string | null;
    occupation: string | null;
  };
  baselineMeasurement: CoachingBodyMeasurementSummary | null;
};

export type CoachingGenerationMealPhotoRef = {
  mealSlot: "breakfast" | "lunch" | "dinner";
  /** Selected storage path for model pipeline — at most one per primary meal. */
  storagePath: string | null;
  textNote: string | null;
};

export type CoachingGenerationSecondaryMealNote = {
  mealSlot: "fourth_meal" | "snacks" | "drinks";
  textNote: string | null;
};

export type CoachingGenerationTodayContext = {
  logDate: ISODateString;
  submitted: boolean;
  primaryMeals: CoachingGenerationMealPhotoRef[];
  secondaryMealNotes: CoachingGenerationSecondaryMealNote[];
  waterMl: number | null;
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  sleepDurationMinutes: number | null;
  sleepDurationLabel: string | null;
  exerciseNote: string | null;
  bowelMovementCount: number | null;
  customerNote: string | null;
};

export type CoachingGenerationInput = {
  version: typeof COACHING_GENERATION_INPUT_VERSION;
  builtAt: string;
  logDate: ISODateString;
  enrollmentId: EntityId;
  customerId: EntityId;
  profileMemory: CoachingGenerationProfileMemory;
  rollingMemory: CoachingRollingMemory;
  outcomeMemory: CoachingOutcomeMemory;
  coachDirectives: CoachingCoachDirectivesMemory | null;
  todayContext: CoachingGenerationTodayContext;
  priorAiContext: CoachingPriorAiContext | null;
  interventionContext: CoachingInterventionContext;
};

// ---------------------------------------------------------------------------
// Profile / rolling / outcome memory (unchanged from 2a)
// ---------------------------------------------------------------------------

export type CoachingBodyMeasurementSummary = {
  recordDate: ISODateString;
  weightKg: number | null;
  bodyFatPercent: number | null;
  skeletalMuscleKg: number | null;
  visceralFatLevel: number | null;
  bmi: number | null;
  bodyFatKg: number | null;
};

export type CoachingProfileMemory = {
  customerDisplayName: string;
  goal: string | null;
  enrollmentStartedAt: string;
  daysSinceEnrollmentStart: number;
  planSnapshot: CoachingPlanSnapshot;
  customerContext: {
    heightCm: number | null;
    sex: string | null;
    region: string | null;
    occupation: string | null;
  };
  baselineMeasurement: CoachingBodyMeasurementSummary | null;
};

export type CoachingRollingAggregates = {
  windowDays: number;
  daysWithReport: number;
  daysSubmitted: number;
  mealReportRate: number | null;
  breakfastCompletionRate: number | null;
  lunchCompletionRate: number | null;
  dinnerCompletionRate: number | null;
  averageWaterMl: number | null;
  averageSleepDurationMinutes: number | null;
  lateSleepDays: number;
  exerciseDays: number;
  bowelMovementSummary: {
    daysReported: number;
    totalCount: number;
    averagePerDay: number | null;
  };
};

export type CoachingRollingDaySummary = {
  logDate: ISODateString;
  submitted: boolean;
  primaryMealsDone: number;
  primaryMealsTotal: number;
  breakfastReported: boolean;
  lunchReported: boolean;
  dinnerReported: boolean;
  waterMl: number | null;
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  sleepDurationMinutes: number | null;
  exerciseReported: boolean;
  bowelMovementCount: number | null;
  customerNote: string | null;
};

export type CoachingRollingMemory = {
  windowDays: number;
  aggregates: CoachingRollingAggregates;
  recentDays: CoachingRollingDaySummary[];
  recurringPatterns: string[];
};

export type CoachingBodyTrendDelta = {
  label: string;
  baseline: number;
  latest: number;
  delta: number;
  unit: string;
};

export type CoachingOutcomeMemory = {
  baselineMeasurement: CoachingBodyMeasurementSummary | null;
  latestMeasurement: CoachingBodyMeasurementSummary | null;
  daysBetweenMeasurements: number | null;
  trendDeltas: CoachingBodyTrendDelta[];
  trendSummary: string | null;
};

export type CoachingCoachDirectivesMemory = {
  currentFocus: string | null;
  currentPriority: string | null;
  coachInstruction: string | null;
  effectiveFrom: ISODateString | null;
};

export type CoachingTodayMealContext = {
  mealSlot: string;
  mealSlotLabel: string;
  textNote: string | null;
  hasPhoto: boolean;
  photoStoragePath: string | null;
  mealEntryId: string | null;
};

export type CoachingTodayContext = {
  logDate: ISODateString;
  submitted: boolean;
  meals: CoachingTodayMealContext[];
  waterMl: number | null;
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  sleepDurationMinutes: number | null;
  sleepDurationLabel: string | null;
  exerciseNote: string | null;
  bowelMovementCount: number | null;
  customerNote: string | null;
};

export type CoachingAiInputSnapshot = {
  version: typeof COACHING_AI_SNAPSHOT_VERSION;
  builtAt: string;
  logDate: ISODateString;
  enrollmentId: EntityId;
  customerId: EntityId;
  profileMemory: CoachingProfileMemory;
  rollingMemory: CoachingRollingMemory;
  outcomeMemory: CoachingOutcomeMemory;
  coachDirectives: CoachingCoachDirectivesMemory | null;
  todayContext: CoachingTodayContext;
  priorAiContext?: CoachingPriorAiContext | null;
};

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type CoachingAiOutputRecord = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  logDate: ISODateString;
  pointKey: CoachingAiPointKey;
  inputFingerprint: string;
  inputSnapshot: CoachingGenerationInput;
  outputJson: CoachingDailyGenerationOutputJson | null;
  model: string | null;
  promptVersion: string | null;
  status: CoachingAiOutputStatus;
  errorMessage: string | null;
  regenerationCount: number;
  aiProposedInterventionLevel: CoachingInterventionLevel | null;
  finalInterventionLevel: CoachingInterventionLevel | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachingGenerationJobRecord = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  logDate: ISODateString;
  outputId: EntityId;
  inputFingerprint: string;
  status: CoachingGenerationJobStatus;
  attemptCount: number;
  availableAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachingCoachDirectivesRecord = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  currentFocus: string | null;
  currentPriority: string | null;
  coachInstruction: string | null;
  effectiveFrom: ISODateString;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// LLM telemetry
// ---------------------------------------------------------------------------

export type LlmUsageCounts = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  imageCount?: number;
};

export type LlmImageUsageMetadata = {
  detail?: "low" | "high" | "auto";
  totalPixels?: number;
  notes?: string;
  coachingMealImages?: CoachingMealImageUsageMetadata;
};

export type CoachingMealImageUsageMetadata = {
  selectedImageCount: number;
  originalTotalBytes: number;
  processedTotalBytes: number;
  failedImageCount: number;
  images: Array<{
    mealSlot: "breakfast" | "lunch" | "dinner";
    sourceStoragePath: string;
    originalWidth: number;
    originalHeight: number;
    originalByteLength: number;
    processedWidth: number;
    processedHeight: number;
    processedByteLength: number;
  }>;
};

export type PreparedCoachingMealImage = {
  mealSlot: "breakfast" | "lunch" | "dinner";
  sourceStoragePath: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  byteLength: number;
  buffer: Buffer;
  originalWidth: number;
  originalHeight: number;
  originalByteLength: number;
};

export type FailedCoachingMealImage = {
  mealSlot: "breakfast" | "lunch" | "dinner";
  sourceStoragePath: string;
  errorCode: string;
  errorMessage: string;
};

export type AiLlmCallLogEntry = {
  id?: EntityId;
  feature: CoachingAiLlmFeature;
  pointKey: string | null;
  customerId: EntityId | null;
  enrollmentId: EntityId | null;
  ownerMemberId: EntityId | null;
  model: string;
  promptVersion: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  imageCount: number;
  imageUsageMetadata: LlmImageUsageMetadata | null;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  pricingFound: boolean;
  status: CoachingAiLlmCallStatus;
  errorCode: string | null;
  inputFingerprint: string | null;
  createdAt?: string;
};

export type LlmCostEstimateInput = LlmUsageCounts & {
  model: string;
};

export type LlmCostEstimateResult = {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  imageCount: number;
  estimatedCostUsd: number | null;
  pricingFound: boolean;
};
