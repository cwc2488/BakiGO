/** Baki Go 21 — customer-facing 21-day AI nutrition coaching experience. */

export const GO21_BRAND_NAME = "Baki Go 21" as const;
export const GO21_BRAND_SUBTITLE = "21 天私人飲食陪跑" as const;
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
  /**
   * eaten = already consumed; planned = future intent; other = not a meal report.
   * Never invent certainty when ambiguous.
   */
  utteranceKind: "eaten" | "planned" | "other" | null;
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
  /** Sleep hours when customer stated a defensible duration (e.g. 睡了6小時). */
  sleepHours: number | null;
  /** Approximate bedtime HH:mm when stated. */
  sleepBedtime: string | null;
  /** Approximate wake time HH:mm when stated. */
  sleepWakeTime: string | null;
  /** Qualitative sleep note — never invents hours. */
  sleepNote: string | null;
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

/** Current-turn utterance mode — steers response freedom, not a rigid script. */
export const GO21_UTTERANCE_MODES = [
  "reporting",
  "asking_advice",
  "factual_question",
  "seeking_help",
  "making_plan",
  "casual_chat",
  "memory_check",
  "other",
] as const;
export type Go21UtteranceMode = (typeof GO21_UTTERANCE_MODES)[number];

export const GO21_UNDERSTANDING_CATEGORIES = [
  "eating_pattern",
  "preference",
  "difficulty",
  "trigger",
  "strategy_worked",
  "strategy_failed",
  "timing_goal_link",
  "communication",
  "other",
] as const;
export type Go21UnderstandingCategory = (typeof GO21_UNDERSTANDING_CATEGORIES)[number];

export const GO21_UNDERSTANDING_ITEM_STATUSES = [
  "emerging",
  "active",
  "confirmed",
  "revised",
  "rejected",
] as const;
export type Go21UnderstandingItemStatus = (typeof GO21_UNDERSTANDING_ITEM_STATUSES)[number];

export type Go21UnderstandingEvidence = {
  at: string;
  logDate: string;
  signal: string;
  summary: string;
};

export type Go21UnderstandingItem = {
  id: string;
  category: Go21UnderstandingCategory;
  /** Stable key for merge / revise (e.g. small_lunch_evening_binge). */
  patternKey: string;
  statement: string;
  confidence: number;
  status: Go21UnderstandingItemStatus;
  evidenceCount: number;
  supportingEvidence: Go21UnderstandingEvidence[];
  contradictingEvidence: Go21UnderstandingEvidence[];
  firstSeenLogDate: string;
  lastSeenLogDate: string;
  revisedFromId: string | null;
};

export type Go21UnderstandingObservation = {
  logDate: string;
  signal: string;
  detail: string;
  at: string;
};

export type Go21UnderstandingExperiment = {
  id: string;
  description: string;
  status: "proposed" | "running" | "worked" | "failed" | "inconclusive";
  startedLogDate: string;
  relatedPatternKey: string | null;
  outcomeNote: string | null;
};

/** Durable enrollment-level personal understanding (Premium Coaching Brain). */
export type Go21UnderstandingRecord = {
  version: 1;
  items: Go21UnderstandingItem[];
  observations: Go21UnderstandingObservation[];
  preferences: Array<{
    content: string;
    polarity: "like" | "dislike" | "constraint";
    confidence: number;
    lastSeenLogDate: string;
  }>;
  experiments: Go21UnderstandingExperiment[];
  /** Short notes about what coaching approaches fit this person. */
  coachingNotes: string[];
  updatedAt: string;
};

/** Compact block injected into freeform generation. */
export type Go21LongitudinalUnderstandingForAi = {
  relationshipDay: number | null;
  stage: string;
  utteranceMode: Go21UtteranceMode;
  coachingPosture: string;
  knownPreferences: Array<{ content: string; polarity: string; confidence: number }>;
  /** Low-confidence — remember only; do not claim as established pattern. */
  emergingObservations: Array<{ statement: string; confidence: number; evidenceCount: number }>;
  /** Enough evidence to influence judgment silently. */
  activeInsights: Array<{
    statement: string;
    confidence: number;
    evidenceCount: number;
    patternKey: string;
    category: string;
  }>;
  /** May mention to the customer this turn if useful. */
  shareableInsights: Array<{
    statement: string;
    confidence: number;
    evidenceCount: number;
    patternKey: string;
    customerFacingHint: string;
  }>;
  strategiesWorked: string[];
  strategiesFailed: string[];
  openExperiments: Array<{ description: string; status: string }>;
  day21SynthesisReady: boolean;
  guidance: string;
};

/** Source of a daily-targets snapshot. */
export type Go21DailyTargetsSource = "activation" | "coach_edit" | "ui_edit";

/** Durable daily coaching targets (water / calories / protein / sleep). */
export type Go21DailyTargetsSnapshot = {
  waterMl: number | null;
  caloriesKcal: number | null;
  proteinG: number | null;
  sleepHours: number | null;
  setAt: string;
  source: Go21DailyTargetsSource;
};

export type Go21DailyTargetsHistoryEntry = {
  at: string;
  targets: Go21DailyTargetsSnapshot;
  reason: string;
};

export type Go21DailyTargetsRecord = {
  version: 1;
  current: Go21DailyTargetsSnapshot;
  history: Go21DailyTargetsHistoryEntry[];
};

export type Go21DailyTargetsPublicView = {
  waterMl: number | null;
  caloriesKcal: number | null;
  proteinG: number | null;
  sleepHours: number | null;
  setAt: string;
  source: Go21DailyTargetsSource;
  /** True when at least one target is set. */
  hasAny: boolean;
};

/** Confidence for estimated daily nutrition — never imply false precision. */
export type Go21EstimateConfidence =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "reported";

/** Lightweight today state for UI + AI (not a tracker dashboard). */
export type Go21DailyStatePublicView = {
  logDate: string;
  targets: Go21DailyTargetsPublicView | null;
  water: {
    ml: number | null;
    confidence: Go21EstimateConfidence;
    qualitative: "low" | "high" | null;
  };
  calories: {
    /** Midpoint of estimate band when available — UI must not show as exact. */
    approxKcal: number | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    confidence: Go21EstimateConfidence;
  };
  protein: {
    approxG: number | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    confidence: Go21EstimateConfidence;
  };
  sleep: {
    hours: number | null;
    bedtime: string | null;
    wakeTime: string | null;
    confidence: Go21EstimateConfidence;
    note: string | null;
  };
  /** Soft coaching cues for UI (never fake %). */
  cues: Array<{
    key: "water" | "calories" | "protein" | "sleep";
    tone: "quiet" | "soft" | "attention";
    label: string;
  }>;
};

/** Fast coach presets — starting points, not medical prescriptions. */
export const GO21_DAILY_TARGET_PRESETS = [
  {
    id: "light",
    label: "輕量",
    hint: "較低熱量、穩蛋白質",
    waterMl: 2000,
    caloriesKcal: 1400,
    proteinG: 80,
    sleepHours: 7,
  },
  {
    id: "standard",
    label: "標準",
    hint: "一般減脂陪跑常用",
    waterMl: 2500,
    caloriesKcal: 1600,
    proteinG: 100,
    sleepHours: 7.5,
  },
  {
    id: "active",
    label: "活躍",
    hint: "活動量較高",
    waterMl: 3000,
    caloriesKcal: 2000,
    proteinG: 120,
    sleepHours: 8,
  },
] as const;

/** Coach Daily Plan — periods (generic, not brand-specific). */
export const GO21_COACH_PLAN_PERIODS = [
  "breakfast",
  "morning",
  "lunch",
  "afternoon",
  "dinner",
  "evening",
  "night",
  "anytime",
  "other",
] as const;
export type Go21CoachPlanPeriod = (typeof GO21_COACH_PLAN_PERIODS)[number];

export const GO21_COACH_PLAN_PERIOD_LABELS: Record<Go21CoachPlanPeriod, string> = {
  breakfast: "早餐",
  morning: "早上",
  lunch: "午餐",
  afternoon: "下午",
  dinner: "晚餐",
  evening: "傍晚",
  night: "睡前",
  anytime: "不限時段",
  other: "其他",
};

export type Go21CoachPlanSource = "activation" | "coach_edit";

/** Single coach-prescribed plan item — name/amount are free text (coach data). */
export type Go21CoachPlanItem = {
  id: string;
  period: Go21CoachPlanPeriod;
  name: string;
  amount: string | null;
  instruction: string | null;
  /** "daily" | "weekdays" | "weekends" | ISO weekday numbers 1=Mon…7=Sun */
  recurrence: "daily" | "weekdays" | "weekends" | number[];
  sortOrder: number;
  enabled: boolean;
};

export type Go21CoachPlanSnapshot = {
  items: Go21CoachPlanItem[];
  setAt: string;
  source: Go21CoachPlanSource;
  /** Inclusive Taipei log date this snapshot takes effect (null = standing). */
  effectiveFrom: string | null;
};

export type Go21CoachPlanHistoryEntry = {
  at: string;
  plan: Go21CoachPlanSnapshot;
  reason: string;
};

export type Go21CoachPlanRecord = {
  version: 1;
  current: Go21CoachPlanSnapshot;
  history: Go21CoachPlanHistoryEntry[];
};

export type Go21CoachPlanPublicView = {
  items: Go21CoachPlanItem[];
  setAt: string;
  source: Go21CoachPlanSource;
  effectiveFrom: string | null;
  hasAny: boolean;
};

/** Per-day inferred execution — separate from coach-prescribed plan. */
export type Go21PlanDayItemState = {
  itemId: string;
  status: "unknown" | "completed" | "skipped_intentional" | "missed" | "adjusted";
  evidence: string | null;
  confidence: "low" | "medium" | "high";
  note: string | null;
  updatedAt: string;
};

export type Go21PlanDayRecord = {
  version: 1;
  logDate: string;
  /** Snapshot of plan item ids/names that applied this day (for history). */
  appliedItemIds: string[];
  items: Go21PlanDayItemState[];
  updatedAt: string;
};

/** Quiet AI compact for coach plan + today execution. */
export type Go21CoachPlanForAi = {
  items: Array<{
    id: string;
    period: Go21CoachPlanPeriod;
    periodLabel: string;
    name: string;
    amount: string | null;
    instruction: string | null;
  }>;
  today: Array<{
    itemId: string;
    status: Go21PlanDayItemState["status"];
    evidence: string | null;
    confidence: string;
  }>;
  guidance: string;
};

/** Sensible empty starter rows for activation — coach fills names freely. */
export const GO21_COACH_PLAN_STARTER_ITEMS: Array<{
  period: Go21CoachPlanPeriod;
  name: string;
  amount: string | null;
}> = [
  { period: "breakfast", name: "", amount: null },
  { period: "lunch", name: "", amount: null },
  { period: "afternoon", name: "", amount: null },
  { period: "dinner", name: "", amount: null },
];

