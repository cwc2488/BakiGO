import type { EntityId, ISODateString, StoredEntity } from "./common";

export const CONSULTATION_TOTAL_STEPS = 14;

export const CONSULTATION_PHASE1_MAX_STEP = 3;

export const CONSULTATION_PHASE2_MAX_STEP = 8;

export type ConsultationStatus =
  | "in_progress"
  | "completed"
  | "follow_up"
  | "not_ready"
  | "abandoned";

export type HealthSafetyFlag =
  | "pending_review"
  | "normal"
  | "caution"
  | "professional_review_required";

export type ConsultationSession = StoredEntity & {
  customerId: EntityId;
  ownerMemberId: EntityId;
  quizResultId?: EntityId;
  bodyCompositionRecordId?: EntityId;
  currentStep: number;
  status: ConsultationStatus;
  commitmentScore?: number;
  healthSafetyFlag: HealthSafetyFlag;
  successStoryCount: number;
  briefSnapshot?: ConsultationBriefSnapshot;
  startedAt: string;
  completedAt?: string;
};

export type ConsultationData = {
  sessionId: EntityId;
  dataJson: ConsultationDataJson;
  createdAt: string;
  updatedAt: string;
};

export type ConsultationSessionRecord = {
  session: ConsultationSession;
  data: ConsultationData;
};

export type ConsultationHealthSafetyReviewStatus = "pending_rules";

export type ConsultationHealthData = {
  safetyReviewStatus: ConsultationHealthSafetyReviewStatus;
  chronicConditions?: string;
  longTermMedications?: string;
  recentHealthChanges?: string;
  allergies?: string;
  surgeriesOrInjuries?: string;
  partnerNotes?: string;
};

export type ConsultationBasicInfoExtras = Record<string, never>;

export type ConsultationGoalType =
  | "fat_loss"
  | "muscle_gain"
  | "body_recomposition"
  | "health"
  | "other";

export type ConsultationGoalsData = {
  goalType?: ConsultationGoalType;
  targetWeightKg?: number;
  targetBodyFatPercent?: number;
  desiredBodyDescription?: string;
  goalNotes?: string;
};

export type ConsultationPreviousExperienceData = {
  hasPreviousExperience?: boolean;
  previousMethods?: string[];
  previousResult?: string;
  regainedOrStopped?: string;
  whyStoppedOrRegained?: string;
  experienceNotes?: string;
};

export type ConsultationMotivationsData = {
  reason1?: string;
  reason2?: string;
  reason3?: string;
  motivationNotes?: string;
};

export const CONSULTATION_BARRIER_KEYS = [
  "time",
  "diet",
  "work_schedule",
  "family",
  "budget",
  "exercise",
  "dont_know_how",
  "fear_of_failure",
  "past_failure",
  "lack_of_support",
  "other",
] as const;

export type ConsultationBarrierKey = (typeof CONSULTATION_BARRIER_KEYS)[number];

export type ConsultationBarriersData = {
  barriers?: ConsultationBarrierKey[];
  primaryBarrier?: ConsultationBarrierKey;
  barrierNotes?: string;
  potentialBarriers?: ConsultationBarrierKey[];
  potentialBarrierNotes?: string;
};

export type ConsultationReadinessGateDecision = "ready" | "not_ready";

export type ConsultationReadinessData = {
  readyIfBarrierSolved?: boolean;
  notReadyReason?: string;
  followUpNotes?: string;
  followUpDate?: ISODateString;
  gateDecision?: ConsultationReadinessGateDecision;
  gateDecidedAt?: string;
};

export type ConsultationMethodInterest = "yes" | "unsure" | "no";

export type ConsultationMethodInterestData = {
  interest: ConsultationMethodInterest;
  notes?: string;
  decidedAt?: string;
};

export type ConsultationEducationData = {
  goalType?: ConsultationGoalType;
  acknowledged?: boolean;
  acknowledgedAt?: string;
};

export type ConsultationCooperationStatus = "can_do" | "needs_adjustment" | "cannot_do";

export const CONSULTATION_EXERCISE_METHOD_KEYS = [
  "coach_class",
  "self_guided",
  "home_video",
  "online",
  "other",
] as const;

export type ConsultationExerciseMethodKey = (typeof CONSULTATION_EXERCISE_METHOD_KEYS)[number];

export type ConsultationCooperationItemData = {
  status: ConsultationCooperationStatus;
  difficultyReason?: string;
  notes?: string;
};

export type ConsultationHydrationCooperationData = ConsultationCooperationItemData;

export type ConsultationSleepScheduleCooperationData = ConsultationCooperationItemData & {
  currentSleepTime?: string;
  currentWakeTime?: string;
  targetAdjustment?: string;
};

export type ConsultationExerciseCooperationData = ConsultationCooperationItemData & {
  weeklyFrequency?: string;
  methods?: ConsultationExerciseMethodKey[];
  methodNotes?: string;
};

export type ConsultationNutritionCooperationData = ConsultationCooperationItemData;

export type ConsultationCooperationData = {
  hydration?: ConsultationHydrationCooperationData;
  sleepSchedule?: ConsultationSleepScheduleCooperationData;
  exercise?: ConsultationExerciseCooperationData;
  nutrition?: ConsultationNutritionCooperationData;
};

export type ConsultationMealSlotData = {
  time?: string;
  content?: string;
};

export type ConsultationMealsData = {
  breakfast?: ConsultationMealSlotData;
  lunch?: ConsultationMealSlotData;
  dinner?: ConsultationMealSlotData;
};

export type ConsultationServicesData = {
  explained?: boolean;
  explainedAt?: string;
};

export type ConsultationOutcomeValue =
  | "started"
  | "considering"
  | "follow_up"
  | "not_ready"
  | "declined";

export type ConsultationOutcomeData = {
  outcome: ConsultationOutcomeValue;
  customerQuestions?: string;
  objections?: string;
  nextStep?: string;
  followUpDate?: ISODateString;
  notes?: string;
  decidedAt?: string;
};

export type ConsultationBriefSnapshot = {
  generatedAt: string;
  sessionId: EntityId;
  customerId: EntityId;
  customerProfile: {
    displayName: string;
    phone?: string;
    sex?: string;
    birthDate?: string;
    region?: string;
    occupation?: string;
    heightCm?: number;
  };
  bodyMeasurement?: Record<string, unknown>;
  goal?: ConsultationGoalsData;
  previousExperience?: ConsultationPreviousExperienceData;
  motivations?: ConsultationMotivationsData;
  commitmentScore?: number;
  barriers?: ConsultationBarriersData;
  readiness?: ConsultationReadinessData;
  successStoryCount: number;
  methodInterest?: ConsultationMethodInterestData;
  education?: ConsultationEducationData;
  cooperation?: ConsultationCooperationData;
  meals?: ConsultationMealsData;
  services?: ConsultationServicesData;
  outcome?: ConsultationOutcomeData;
  healthSafetyFlag: HealthSafetyFlag;
  sessionStatus: ConsultationStatus;
};

export type ConsultationDataJson = {
  health?: ConsultationHealthData;
  basicInfoExtras?: ConsultationBasicInfoExtras;
  phase1CompletedAt?: ISODateString;
  goals?: ConsultationGoalsData;
  previousExperience?: ConsultationPreviousExperienceData;
  motivations?: ConsultationMotivationsData;
  barriers?: ConsultationBarriersData;
  readiness?: ConsultationReadinessData;
  methodInterest?: ConsultationMethodInterestData;
  education?: ConsultationEducationData;
  cooperation?: ConsultationCooperationData;
  meals?: ConsultationMealsData;
  services?: ConsultationServicesData;
  outcome?: ConsultationOutcomeData;
};

export type CreateConsultationSessionInput = {
  customerId: EntityId;
  ownerMemberId: EntityId;
  quizResultId?: EntityId;
};

export type SaveConsultationStep2Input = {
  health: ConsultationHealthData;
};

export type CompleteConsultationStep3Input = {
  bodyCompositionRecordId: EntityId;
};
