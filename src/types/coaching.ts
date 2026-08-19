import type { EntityId, ISODateString } from "@/types";

export const COACHING_MEAL_SLOTS = [
  "breakfast",
  "lunch",
  "dinner",
  "fourth_meal",
  "snacks",
  "drinks",
] as const;

export type CoachingMealSlot = (typeof COACHING_MEAL_SLOTS)[number];

export const PRIMARY_MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;

export type PrimaryMealSlot = (typeof PRIMARY_MEAL_SLOTS)[number];

export const COACHING_ENROLLMENT_STATUSES = ["active", "paused", "completed"] as const;

export type CoachingEnrollmentStatus = (typeof COACHING_ENROLLMENT_STATUSES)[number];

export type CoachingPlanSnapshot = {
  version: 1;
  dietaryGuidelines: string[];
  dailyInstructions: {
    wakeUp: string[];
    breakfast: string[];
    lunch: string[];
    dinner: string[];
    snacks: string[];
    hydration: string[];
    sleep: string[];
  };
  reportingRules: string[];
  /** Optional coach-only notes stored in enrollment snapshot. */
  coachNotes?: string;
  /**
   * 21D-START-01: marks this journey as a 21-day experience.
   * Optional. 90-day coaching omits this field. Not sent to AI compact prompts.
   */
  experience21d?: {
    productReceivedDate: string;
    interestId?: string;
  };
};

export type CoachingEnrollment = {
  id: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  goal: string | null;
  status: CoachingEnrollmentStatus;
  /** Journey Day 1 authority (timestamptz; date part in Asia/Taipei). */
  startedAt: string;
  /**
   * Inclusive planned journey end (YYYY-MM-DD).
   * Null/undefined in legacy rows → derive startedAt date + 89 days.
   */
  plannedEndAt?: string | null;
  /** Set when status becomes completed (actual end timestamp). */
  endedAt: string | null;
  onboardingCompletedAt: string | null;
  planSnapshot: CoachingPlanSnapshot;
  baselineBodyRecordId: EntityId | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachingDailyLog = {
  id: EntityId;
  enrollmentId: EntityId;
  customerId: EntityId;
  ownerMemberId: EntityId;
  logDate: ISODateString;
  waterMl: number | null;
  exerciseNote: string | null;
  bowelMovementCount: number | null;
  /** Computed display label, e.g. 7小時30分 */
  sleepDuration: string | null;
  /** HH:MM — preserved for future AI */
  sleepBedtime: string | null;
  /** HH:MM — preserved for future AI */
  sleepWakeTime: string | null;
  customerNote: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachingMealEntry = {
  id: EntityId;
  dailyLogId: EntityId;
  mealSlot: CoachingMealSlot;
  textNote: string | null;
  eatenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachingMealPhoto = {
  id: EntityId;
  mealEntryId: EntityId;
  storagePath: string;
  uploadedAt: string;
  createdAt: string;
  signedUrl?: string | null;
};

export type CoachingMealEntryWithPhoto = CoachingMealEntry & {
  photo: CoachingMealPhoto | null;
};

export type CoachingDailyLogDetail = CoachingDailyLog & {
  meals: CoachingMealEntryWithPhoto[];
};

export type CoachingTodayAiBrief = {
  status: "pending" | "processing" | "completed" | "failed" | "missing";
  dailySummary: string | null;
  finalInterventionLevel: "normal" | "watch" | "coach_attention" | null;
  coachAttentionRequired: boolean;
};

export type CoachingTodayStatus = {
  enrollmentId: EntityId;
  customerId: EntityId;
  customerDisplayName: string;
  goal: string | null;
  logDate: ISODateString;
  hasReport: boolean;
  isSubmitted: boolean;
  primaryMealsDone: number;
  primaryMealsTotal: number;
  waterMl: number | null;
  waterDone: boolean;
  sleepDuration: string | null;
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  sleepDone: boolean;
  exerciseNote: string | null;
  exerciseDone: boolean;
  bowelMovementCount: number | null;
  aiBrief?: CoachingTodayAiBrief | null;
};

export type CoachingPortalContext = {
  validToken: boolean;
  hasActiveEnrollment: boolean;
  customerId?: EntityId;
  displayName?: string;
  enrollmentId?: EntityId;
  goal?: string | null;
  startedAt?: string;
  /**
   * Inclusive journey end (YYYY-MM-DD). Soft until portal RPC / context always returns it.
   * TODO: wire plannedEndAt from resolve_coaching_portal_context once RPC includes planned_end_at.
   */
  plannedEndAt?: string | null;
  onboardingCompletedAt?: string | null;
  planSnapshot?: CoachingPlanSnapshot;
};

export const COACHING_MEAL_SLOT_LABELS: Record<CoachingMealSlot, string> = {
  breakfast: "早餐／第一餐",
  lunch: "午餐／第二餐",
  dinner: "晚餐／第三餐",
  fourth_meal: "第四餐／宵夜",
  snacks: "零食",
  drinks: "飲料",
};

export const COACHING_STATUS_LABELS: Record<CoachingEnrollmentStatus, string> = {
  active: "陪跑中",
  paused: "已暫停",
  completed: "已結束",
};
