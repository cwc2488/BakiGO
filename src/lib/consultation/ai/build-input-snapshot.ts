import type {
  BarrierInsightInputSnapshot,
  ConsultationBodySummary,
  MotivationInsightInputSnapshot,
} from "@/types/consultation-ai";
import type {
  ConsultationBarriersData,
  ConsultationDataJson,
  ConsultationReadinessData,
  ConsultationSession,
} from "@/types/consultation";

export function buildBodySummary(input: {
  weight_kg?: number | null;
  body_fat_percent?: number | null;
  bmi?: number | null;
  skeletal_muscle_kg?: number | null;
} | null): ConsultationBodySummary | undefined {
  if (!input) {
    return undefined;
  }

  const summary: ConsultationBodySummary = {};
  if (typeof input.weight_kg === "number") summary.weightKg = input.weight_kg;
  if (typeof input.body_fat_percent === "number") summary.bodyFatPercent = input.body_fat_percent;
  if (typeof input.bmi === "number") summary.bmi = input.bmi;
  if (typeof input.skeletal_muscle_kg === "number") summary.skeletalMuscleKg = input.skeletal_muscle_kg;

  return Object.keys(summary).length > 0 ? summary : undefined;
}

export function buildMotivationInsightInputSnapshot(input: {
  dataJson: ConsultationDataJson;
  bodySummary?: ConsultationBodySummary;
}): MotivationInsightInputSnapshot {
  return {
    goal: input.dataJson.goals,
    previousExperience: input.dataJson.previousExperience,
    motivations: input.dataJson.motivations,
    bodySummary: input.bodySummary,
  };
}

export function buildBarrierInsightInputSnapshot(input: {
  session: Pick<ConsultationSession, "commitmentScore">;
  dataJson: ConsultationDataJson;
  bodySummary?: ConsultationBodySummary;
  barrierDraft?: ConsultationBarriersData;
  readinessDraft?: Pick<
    ConsultationReadinessData,
    "readyIfBarrierSolved" | "notReadyReason" | "followUpNotes"
  >;
}): BarrierInsightInputSnapshot | null {
  const commitmentScore = input.session.commitmentScore;
  if (commitmentScore === undefined || commitmentScore < 6 || commitmentScore > 9) {
    return null;
  }

  return {
    goal: input.dataJson.goals,
    previousExperience: input.dataJson.previousExperience,
    motivations: input.dataJson.motivations,
    commitmentScore,
    barriers: input.barrierDraft ?? input.dataJson.barriers,
    readiness: input.readinessDraft ?? input.dataJson.readiness,
    bodySummary: input.bodySummary,
  };
}

export function hasMotivationInsightInput(snapshot: MotivationInsightInputSnapshot): boolean {
  const motivations = snapshot.motivations;
  return Boolean(
    motivations?.reason1?.trim() ||
      motivations?.reason2?.trim() ||
      motivations?.reason3?.trim(),
  );
}
