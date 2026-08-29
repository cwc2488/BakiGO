/** Baki Go 21 — customer-facing 21-day AI nutrition coaching experience. */

export const GO21_BRAND_NAME = "Baki Go 21" as const;
export const GO21_BRAND_SUBTITLE = "你的 21 天 AI 飲食教練" as const;
export const GO21_CYCLE_DAYS = 21 as const;

export const GO21_MEASUREMENT_DAYS = [1, 7, 14, 21] as const;
export type Go21MeasurementDay = (typeof GO21_MEASUREMENT_DAYS)[number];

export const GO21_REMINDER_KINDS = [
  "daily_light",
  "open_loop",
  "measurement_day7",
  "measurement_day14",
  "measurement_day21",
  "experiment",
  "reengagement",
] as const;
export type Go21ReminderKind = (typeof GO21_REMINDER_KINDS)[number];

export const GO21_REMINDER_STATUSES = ["scheduled", "delivered", "cancelled", "suppressed"] as const;
export type Go21ReminderStatus = (typeof GO21_REMINDER_STATUSES)[number];

/** Quiet hours Asia/Taipei — no proactive reminders in this window. */
export const GO21_QUIET_HOURS = { startHour: 22, endHour: 8 } as const;

/** Max proactive reminders delivered per calendar day. */
export const GO21_MAX_REMINDERS_PER_DAY = 2 as const;

/** Min hours between any two delivered reminders. */
export const GO21_REMINDER_COOLDOWN_HOURS = 4 as const;

/** Days of inactivity before re-engagement reminder. */
export const GO21_REENGAGEMENT_IDLE_DAYS = 2 as const;

export type Go21RelevanceClass =
  | "in_scope"
  | "contextually_relevant"
  | "out_of_scope"
  | "safety";

export type Go21HydrationQuality = "low" | "high" | null;

export type Go21CorrectionOp = {
  kind: "event_date" | "meal_slot" | "weight_kg" | "target_weight_kg";
  from: string | number | null;
  to: string | number | null;
};

export type Go21ExtractedEvent = {
  eventDate: string | null;
  eventTimeApprox: string | null;
  mealSlot: "breakfast" | "lunch" | "dinner" | "snacks" | "drinks" | "fourth_meal" | null;
  mealNote: string | null;
  weightKg: number | null;
  /** Optional desired target — never inferred from vague 「我想瘦」 alone. */
  targetWeightKg: number | null;
  bodyFatPercent: number | null;
  skeletalMuscleKg: number | null;
  visceralFatLevel: number | null;
  basalMetabolicRate: number | null;
  /** Numeric water only when customer supplied a defensible quantity. */
  waterMl: number | null;
  /** Qualitative hydration signal — never invents ml. */
  hydrationQuality: Go21HydrationQuality;
  hydrationNote: string | null;
  exerciseNote: string | null;
  hungerMentioned: boolean;
  confidence: "high" | "medium" | "low";
  unresolvedQuestions: string[];
  corrections: Go21CorrectionOp[];
  goalRefinement: Go21GoalRefinementProposal | null;
};

export type Go21ChatTurnView = {
  id: string;
  role: "customer" | "coach" | "system";
  content: string;
  createdAt: string;
  channel?: string | null;
  photoPreviewUrl?: string | null;
};

export type Go21ProgressMilestone = {
  day: number;
  label: string;
  kind: "start" | "measurement" | "review";
  optional: boolean;
  reached: boolean;
  completed: boolean;
};

/** Consumer-facing primary directions — orientation signals, not rigid AI classes. */
export const GO21_PRIMARY_DIRECTIONS = [
  "fat_loss_body",
  "stable_habits",
  "reduce_chaos_eating",
  "energy_lifestyle",
  "other",
] as const;
export type Go21PrimaryDirection = (typeof GO21_PRIMARY_DIRECTIONS)[number];

export const GO21_PRIMARY_DIRECTION_LABELS: Record<Go21PrimaryDirection, string> = {
  fat_loss_body: "減脂／體態改善",
  stable_habits: "建立更穩定的飲食習慣",
  reduce_chaos_eating: "改善容易失控／亂吃的狀況",
  energy_lifestyle: "提升精神與生活狀態",
  other: "其他",
};

export type Go21GoalSource = "onboarding" | "chat_confirmed" | "ui_edit";

/** Single goal snapshot (current or historical). */
export type Go21GoalSnapshot = {
  primaryDirection: Go21PrimaryDirection;
  /** Customer's original wording — never replace with a canned label. */
  personalGoal: string;
  /** Optional measurable target only when customer explicitly set one. */
  targetWeightKg: number | null;
  setAt: string;
  source: Go21GoalSource;
};

export type Go21GoalHistoryEntry = {
  at: string;
  goal: Go21GoalSnapshot;
  reason: string;
};

/** Durable enrollment-level goal record (authoritative). */
export type Go21GoalRecord = {
  version: 1;
  current: Go21GoalSnapshot;
  original: Go21GoalSnapshot;
  history: Go21GoalHistoryEntry[];
};

export type Go21GoalPublicView = {
  primaryDirection: Go21PrimaryDirection;
  primaryDirectionLabel: string;
  personalGoal: string;
  targetWeightKg: number | null;
  originalPersonalGoal: string | null;
  wasRefined: boolean;
  setAt: string;
};

export type Go21GoalRefinementProposal = {
  personalGoal?: string | null;
  primaryDirection?: Go21PrimaryDirection | null;
  targetWeightKg?: number | null;
  clearTargetWeight?: boolean;
  confidence: "high" | "medium" | "low";
  needsConfirmation: boolean;
};
