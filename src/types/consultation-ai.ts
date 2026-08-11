import type { EntityId } from "./common";
import type {
  ConsultationBarriersData,
  ConsultationGoalsData,
  ConsultationMotivationsData,
  ConsultationPreviousExperienceData,
  ConsultationReadinessData,
} from "./consultation";

export const CONSULTATION_AI_POINT_KEYS = {
  MOTIVATION_INSIGHT: "motivation_insight",
  BARRIER_INSIGHT: "barrier_insight",
} as const;

export type ConsultationAiPointKey =
  (typeof CONSULTATION_AI_POINT_KEYS)[keyof typeof CONSULTATION_AI_POINT_KEYS];

export type ConsultationAiOutputStatus = "pending" | "completed" | "failed";

export type ConsultationBodySummary = {
  weightKg?: number;
  bodyFatPercent?: number;
  bmi?: number;
  skeletalMuscleKg?: number;
};

export type MotivationInsightInputSnapshot = {
  goal?: ConsultationGoalsData;
  previousExperience?: ConsultationPreviousExperienceData;
  motivations?: ConsultationMotivationsData;
  bodySummary?: ConsultationBodySummary;
};

export type BarrierInsightInputSnapshot = {
  goal?: ConsultationGoalsData;
  previousExperience?: ConsultationPreviousExperienceData;
  motivations?: ConsultationMotivationsData;
  commitmentScore: number;
  barriers?: ConsultationBarriersData;
  readiness?: Pick<
    ConsultationReadinessData,
    "readyIfBarrierSolved" | "notReadyReason" | "followUpNotes"
  >;
  bodySummary?: ConsultationBodySummary;
};

export type MotivationInsightOutput = {
  coreMotivation: string;
  motivationSummary: string;
  signals: string[];
  recommendedFollowUpQuestion: string;
  coachNote: string;
  confidence: number;
};

export type BarrierInsightOutput = {
  surfaceBarrier: string;
  possibleUnderlyingBarrier: string;
  evidence: string[];
  recommendedQuestion: string;
  coachNote: string;
  confidence: number;
};

export type ConsultationAiOutputRecord = {
  id: EntityId;
  sessionId: EntityId;
  ownerMemberId: EntityId;
  pointKey: ConsultationAiPointKey;
  inputSnapshot: MotivationInsightInputSnapshot | BarrierInsightInputSnapshot;
  outputJson: MotivationInsightOutput | BarrierInsightOutput | null;
  model: string | null;
  status: ConsultationAiOutputStatus;
  errorMessage: string | null;
  regenerationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ConsultationAiApiResponse = {
  ok: boolean;
  output?: ConsultationAiOutputRecord;
  error?: string;
  canRegenerate?: boolean;
};
