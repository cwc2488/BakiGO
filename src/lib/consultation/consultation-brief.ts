import type {
  BodyCompositionRecord,
  Customer,
  CustomerSex,
} from "@/types/customer";
import type {
  ConsultationBriefSnapshot,
  ConsultationDataJson,
  ConsultationSession,
} from "@/types/consultation";

export function buildConsultationBriefSnapshot(input: {
  session: ConsultationSession;
  dataJson: ConsultationDataJson;
  customer: Pick<
    Customer,
    "displayName" | "phone" | "sex" | "birthDate" | "region" | "occupation" | "heightCm"
  >;
  bodyRecord?: Pick<
    BodyCompositionRecord,
    | "recordDate"
    | "weightKg"
    | "bodyFatPercent"
    | "skeletalMuscleKg"
    | "bodyFatKg"
    | "bmi"
    | "visceralFatLevel"
    | "basalMetabolicRate"
    | "bodyAge"
    | "age"
  >;
  generatedAt?: string;
}): ConsultationBriefSnapshot {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  return {
    generatedAt,
    sessionId: input.session.id,
    customerId: input.session.customerId,
    customerProfile: {
      displayName: input.customer.displayName,
      phone: input.customer.phone,
      sex: input.customer.sex as CustomerSex | undefined,
      birthDate: input.customer.birthDate,
      region: input.customer.region,
      occupation: input.customer.occupation,
      heightCm: input.customer.heightCm,
    },
    bodyMeasurement: input.bodyRecord
      ? {
          recordDate: input.bodyRecord.recordDate,
          weightKg: input.bodyRecord.weightKg,
          bodyFatPercent: input.bodyRecord.bodyFatPercent,
          skeletalMuscleKg: input.bodyRecord.skeletalMuscleKg,
          bodyFatKg: input.bodyRecord.bodyFatKg,
          bmi: input.bodyRecord.bmi,
          visceralFatLevel: input.bodyRecord.visceralFatLevel,
          basalMetabolicRate: input.bodyRecord.basalMetabolicRate,
          bodyAge: input.bodyRecord.bodyAge,
          age: input.bodyRecord.age,
        }
      : undefined,
    goal: input.dataJson.goals,
    previousExperience: input.dataJson.previousExperience,
    motivations: input.dataJson.motivations,
    commitmentScore: input.session.commitmentScore,
    barriers: input.dataJson.barriers,
    readiness: input.dataJson.readiness,
    successStoryCount: input.session.successStoryCount,
    methodInterest: input.dataJson.methodInterest,
    education: input.dataJson.education,
    cooperation: input.dataJson.cooperation,
    meals: input.dataJson.meals,
    services: input.dataJson.services,
    outcome: input.dataJson.outcome,
    healthSafetyFlag: input.session.healthSafetyFlag,
    sessionStatus: input.session.status,
  };
}

export function shouldEmitConsultationActivity(outcome: ConsultationBriefSnapshot["outcome"]): boolean {
  return outcome?.outcome === "started";
}
