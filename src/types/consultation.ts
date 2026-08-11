import type { EntityId, ISODateString, StoredEntity } from "./common";

export const CONSULTATION_TOTAL_STEPS = 14;

export const CONSULTATION_PHASE1_MAX_STEP = 3;

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
  briefSnapshot?: Record<string, unknown>;
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

export type ConsultationDataJson = {
  health?: ConsultationHealthData;
  basicInfoExtras?: ConsultationBasicInfoExtras;
  phase1CompletedAt?: ISODateString;
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
