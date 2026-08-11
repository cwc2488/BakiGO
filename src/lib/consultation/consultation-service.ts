import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  getStepAfterCompletion,
  mapOutcomeToSessionStatus,
  normalizeBarriersData,
  normalizeCooperationData,
  normalizeEducationData,
  normalizeGoalsData,
  normalizeHealthData,
  normalizeMealsData,
  normalizeMethodInterestData,
  normalizeMotivationsData,
  normalizeOutcomeData,
  normalizePreviousExperienceData,
  normalizeReadinessData,
  normalizeServicesData,
  resolveStep10Outcome,
  resolveStep8Outcome,
  shouldEmitConsultationActivityForOutcome,
  validateCommitmentScore,
  validateStep10Submission,
  validateStep11CanComplete,
  validateStep12CanComplete,
  validateStep13CanComplete,
  validateStep14Submission,
  validateStep6CanComplete,
  validateStep8Submission,
  validateStep9CanComplete,
} from "@/lib/consultation/consultation-flow-engine";
import { buildConsultationBriefSnapshot } from "@/lib/consultation/consultation-brief";
import type {
  ConsultationBarriersData,
  ConsultationBriefSnapshot,
  ConsultationCooperationData,
  ConsultationData,
  ConsultationDataJson,
  ConsultationGoalsData,
  ConsultationMealsData,
  ConsultationMethodInterest,
  ConsultationMotivationsData,
  ConsultationOutcomeData,
  ConsultationPreviousExperienceData,
  ConsultationReadinessData,
  ConsultationServicesData,
  ConsultationSession,
  ConsultationSessionRecord,
  CreateConsultationSessionInput,
  HealthSafetyFlag,
} from "@/types/consultation";

type SessionDbRow = {
  id: string;
  customer_id: string;
  owner_member_id: string;
  quiz_result_id: string | null;
  body_composition_record_id: string | null;
  current_step: number;
  status: ConsultationSession["status"];
  commitment_score: number | null;
  health_safety_flag: HealthSafetyFlag;
  success_story_count: number;
  brief_snapshot: ConsultationBriefSnapshot | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type DataDbRow = {
  session_id: string;
  data_json: ConsultationDataJson;
  created_at: string;
  updated_at: string;
};

function requireServiceClient() {
  if (!isSupabaseServiceConfigured()) {
    throw new Error("Consultation service unavailable.");
  }
  return createSupabaseServiceClient();
}

function mapSession(row: SessionDbRow): ConsultationSession {
  return {
    id: row.id,
    customerId: row.customer_id,
    ownerMemberId: row.owner_member_id,
    quizResultId: row.quiz_result_id ?? undefined,
    bodyCompositionRecordId: row.body_composition_record_id ?? undefined,
    currentStep: row.current_step,
    status: row.status,
    commitmentScore: row.commitment_score ?? undefined,
    healthSafetyFlag: row.health_safety_flag,
    successStoryCount: row.success_story_count,
    briefSnapshot: row.brief_snapshot ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapData(row: DataDbRow): ConsultationData {
  return {
    sessionId: row.session_id,
    dataJson: row.data_json ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertCustomerOwnedByMember(input: {
  customerId: string;
  memberId: string;
}): Promise<void> {
  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, owner_member_id")
    .eq("id", input.customerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Customer not found. Sync customer data and try again.");
  }
  if (data.owner_member_id !== input.memberId) {
    throw new Error("Forbidden");
  }
}

async function assertBodyRecordOwnedByCustomer(input: {
  bodyCompositionRecordId: string;
  customerId: string;
  memberId: string;
}): Promise<void> {
  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("body_composition_records")
    .select("id, customer_id")
    .eq("id", input.bodyCompositionRecordId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.customer_id !== input.customerId) {
    throw new Error("Body composition record not found for this customer.");
  }

  await assertCustomerOwnedByMember({
    customerId: data.customer_id,
    memberId: input.memberId,
  });
}

async function loadSessionRecord(input: {
  sessionId: string;
  memberId: string;
}): Promise<ConsultationSessionRecord> {
  const supabase = requireServiceClient();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("consultation_sessions")
    .select("*")
    .eq("id", input.sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }
  if (!sessionRow) {
    throw new Error("Consultation session not found.");
  }
  if (sessionRow.owner_member_id !== input.memberId) {
    throw new Error("Forbidden");
  }

  const { data: dataRow, error: dataError } = await supabase
    .from("consultation_data")
    .select("*")
    .eq("session_id", input.sessionId)
    .maybeSingle();

  if (dataError) {
    throw new Error(dataError.message);
  }
  if (!dataRow) {
    throw new Error("Consultation data not found.");
  }

  return {
    session: mapSession(sessionRow as SessionDbRow),
    data: mapData(dataRow as DataDbRow),
  };
}

export async function createConsultationSession(
  input: CreateConsultationSessionInput,
): Promise<ConsultationSessionRecord> {
  await assertCustomerOwnedByMember({
    customerId: input.customerId,
    memberId: input.ownerMemberId,
  });

  const supabase = requireServiceClient();
  const now = new Date().toISOString();

  const { data: sessionRow, error: sessionError } = await supabase
    .from("consultation_sessions")
    .insert({
      customer_id: input.customerId,
      owner_member_id: input.ownerMemberId,
      quiz_result_id: input.quizResultId ?? null,
      current_step: 1,
      status: "in_progress",
      health_safety_flag: "pending_review",
      success_story_count: 0,
      started_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (sessionError || !sessionRow) {
    throw new Error(sessionError?.message ?? "Failed to create consultation session.");
  }

  const { data: dataRow, error: dataError } = await supabase
    .from("consultation_data")
    .insert({
      session_id: sessionRow.id,
      data_json: {},
      updated_at: now,
    })
    .select("*")
    .single();

  if (dataError || !dataRow) {
    throw new Error(dataError?.message ?? "Failed to create consultation data.");
  }

  return {
    session: mapSession(sessionRow as SessionDbRow),
    data: mapData(dataRow as DataDbRow),
  };
}

export async function getConsultationSession(input: {
  sessionId: string;
  memberId: string;
}): Promise<ConsultationSessionRecord> {
  return loadSessionRecord(input);
}

export async function completeConsultationStep1(input: {
  sessionId: string;
  memberId: string;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep !== 1) {
    throw new Error("Step 1 is already complete.");
  }

  const supabase = requireServiceClient();
  const now = new Date().toISOString();
  const nextStep = getStepAfterCompletion(1);

  const { error: sessionError } = await supabase
    .from("consultation_sessions")
    .update({ current_step: nextStep, updated_at: now })
    .eq("id", input.sessionId)
    .eq("owner_member_id", input.memberId);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  return loadSessionRecord(input);
}

export async function saveConsultationStep2(input: {
  sessionId: string;
  memberId: string;
  health: Partial<ConsultationDataJson["health"]>;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 2) {
    throw new Error("Complete Step 1 before health concern.");
  }
  if (record.session.currentStep > 2) {
    throw new Error("Step 2 is already complete.");
  }

  const supabase = requireServiceClient();
  const now = new Date().toISOString();
  const nextStep = getStepAfterCompletion(2);
  const health = normalizeHealthData(input.health ?? {});

  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    health,
  };

  const { error: sessionError } = await supabase
    .from("consultation_sessions")
    .update({
      current_step: nextStep,
      updated_at: now,
    })
    .eq("id", input.sessionId)
    .eq("owner_member_id", input.memberId);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const { error: dataError } = await supabase
    .from("consultation_data")
    .update({ data_json: nextDataJson, updated_at: now })
    .eq("session_id", input.sessionId);

  if (dataError) {
    throw new Error(dataError.message);
  }

  return loadSessionRecord(input);
}

export async function completeConsultationStep3(input: {
  sessionId: string;
  memberId: string;
  bodyCompositionRecordId: string;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 3) {
    throw new Error("Complete earlier steps before body measurement.");
  }
  if (record.session.currentStep > 3) {
    throw new Error("Step 3 is already complete.");
  }

  await assertBodyRecordOwnedByCustomer({
    bodyCompositionRecordId: input.bodyCompositionRecordId,
    customerId: record.session.customerId,
    memberId: input.memberId,
  });

  const supabase = requireServiceClient();
  const now = new Date().toISOString();
  const nextStep = getStepAfterCompletion(3);

  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    phase1CompletedAt: now.slice(0, 10),
  };

  const { error: sessionError } = await supabase
    .from("consultation_sessions")
    .update({
      current_step: nextStep,
      body_composition_record_id: input.bodyCompositionRecordId,
      updated_at: now,
    })
    .eq("id", input.sessionId)
    .eq("owner_member_id", input.memberId);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const { error: dataError } = await supabase
    .from("consultation_data")
    .update({ data_json: nextDataJson, updated_at: now })
    .eq("session_id", input.sessionId);

  if (dataError) {
    throw new Error(dataError.message);
  }

  return loadSessionRecord(input);
}

async function assertStepIsActive(input: {
  record: ConsultationSessionRecord;
  stepNumber: number;
}): Promise<void> {
  if (input.record.session.status === "not_ready") {
    throw new Error("Consultation is paused. Cannot advance steps.");
  }
  if (input.record.session.status === "completed") {
    throw new Error("Consultation is already complete.");
  }
  if (input.record.session.currentStep !== input.stepNumber) {
    throw new Error(`Step ${input.stepNumber} is not the active step.`);
  }
}

async function loadCustomerProfile(input: {
  customerId: string;
  memberId: string;
}): Promise<{
  display_name: string;
  phone: string | null;
  sex: string | null;
  birth_date: string | null;
  region: string | null;
  occupation: string | null;
  height_cm: number | null;
}> {
  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .select("display_name, phone, sex, birth_date, region, occupation, height_cm, owner_member_id")
    .eq("id", input.customerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.owner_member_id !== input.memberId) {
    throw new Error("Customer not found.");
  }

  return data;
}

async function loadBodyRecordForBrief(bodyCompositionRecordId: string | undefined) {
  if (!bodyCompositionRecordId) {
    return undefined;
  }
  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("body_composition_records")
    .select(
      "record_date, weight_kg, body_fat_percent, skeletal_muscle_kg, body_fat_kg, bmi, visceral_fat_level, basal_metabolic_rate, body_age, age",
    )
    .eq("id", bodyCompositionRecordId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return undefined;
  }

  return {
    recordDate: data.record_date,
    weightKg: data.weight_kg,
    bodyFatPercent: data.body_fat_percent,
    skeletalMuscleKg: data.skeletal_muscle_kg,
    bodyFatKg: data.body_fat_kg,
    bmi: data.bmi,
    visceralFatLevel: data.visceral_fat_level,
    basalMetabolicRate: data.basal_metabolic_rate,
    bodyAge: data.body_age,
    age: data.age,
  };
}

async function updateSessionData(input: {
  sessionId: string;
  memberId: string;
  sessionPatch: Record<string, unknown>;
  dataJson: ConsultationDataJson;
}): Promise<ConsultationSessionRecord> {
  const supabase = requireServiceClient();
  const now = new Date().toISOString();

  const { error: sessionError } = await supabase
    .from("consultation_sessions")
    .update({ ...input.sessionPatch, updated_at: now })
    .eq("id", input.sessionId)
    .eq("owner_member_id", input.memberId);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const { error: dataError } = await supabase
    .from("consultation_data")
    .update({ data_json: input.dataJson, updated_at: now })
    .eq("session_id", input.sessionId);

  if (dataError) {
    throw new Error(dataError.message);
  }

  return loadSessionRecord({ sessionId: input.sessionId, memberId: input.memberId });
}

export async function saveConsultationStep4(input: {
  sessionId: string;
  memberId: string;
  goals: Partial<ConsultationGoalsData>;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 4) {
    throw new Error("Complete Phase 1 before goal setting.");
  }
  await assertStepIsActive({ record, stepNumber: 4 });

  const goals = normalizeGoalsData(input.goals ?? {});
  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    goals,
  };

  return updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: { current_step: getStepAfterCompletion(4) },
    dataJson: nextDataJson,
  });
}

export async function saveConsultationStep5(input: {
  sessionId: string;
  memberId: string;
  previousExperience: Partial<ConsultationPreviousExperienceData>;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 5) {
    throw new Error("Complete Step 4 before previous experience.");
  }
  await assertStepIsActive({ record, stepNumber: 5 });

  const previousExperience = normalizePreviousExperienceData(input.previousExperience ?? {});
  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    previousExperience,
  };

  return updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: { current_step: getStepAfterCompletion(5) },
    dataJson: nextDataJson,
  });
}

export async function saveConsultationStep6(input: {
  sessionId: string;
  memberId: string;
  motivations: Partial<ConsultationMotivationsData>;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 6) {
    throw new Error("Complete Step 5 before motivations.");
  }
  await assertStepIsActive({ record, stepNumber: 6 });

  const motivations = normalizeMotivationsData(input.motivations ?? {});
  const validationError = validateStep6CanComplete(motivations);
  if (validationError) {
    throw new Error(validationError);
  }

  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    motivations,
  };

  return updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: { current_step: getStepAfterCompletion(6) },
    dataJson: nextDataJson,
  });
}

export async function saveConsultationStep7(input: {
  sessionId: string;
  memberId: string;
  commitmentScore: number;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 7) {
    throw new Error("Complete Step 6 before commitment score.");
  }
  await assertStepIsActive({ record, stepNumber: 7 });

  const validationError = validateCommitmentScore(input.commitmentScore);
  if (validationError) {
    throw new Error(validationError);
  }

  return updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: {
      current_step: getStepAfterCompletion(7),
      commitment_score: input.commitmentScore,
    },
    dataJson: record.data.dataJson,
  });
}

export async function completeConsultationStep8(input: {
  sessionId: string;
  memberId: string;
  barriers: Partial<ConsultationBarriersData>;
  readiness: Partial<ConsultationReadinessData>;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 8) {
    throw new Error("Complete Step 7 before commitment gate.");
  }
  await assertStepIsActive({ record, stepNumber: 8 });

  const commitmentScore = record.session.commitmentScore;
  if (commitmentScore === undefined) {
    throw new Error("Commitment score is required from Step 7.");
  }

  const barriers = normalizeBarriersData(input.barriers ?? {});
  const readinessInput = normalizeReadinessData(input.readiness ?? {});
  const validationError = validateStep8Submission({
    commitmentScore,
    barriers,
    readiness: readinessInput,
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const outcome = resolveStep8Outcome({
    commitmentScore,
    readyIfBarrierSolved: readinessInput.readyIfBarrierSolved,
  });
  const now = new Date().toISOString();
  const readiness: ConsultationReadinessData = {
    ...readinessInput,
    gateDecision: outcome.type === "advance_to_step_9" ? "ready" : "not_ready",
    gateDecidedAt: now,
  };
  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    barriers,
    readiness,
  };

  if (outcome.type === "advance_to_step_9") {
    return updateSessionData({
      sessionId: input.sessionId,
      memberId: input.memberId,
      sessionPatch: {
        current_step: 9,
        status: "in_progress",
      },
      dataJson: nextDataJson,
    });
  }

  return updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: {
      current_step: 8,
      status: "not_ready",
    },
    dataJson: nextDataJson,
  });
}

export async function saveConsultationStep9(input: {
  sessionId: string;
  memberId: string;
  storyAction: "increment" | "decrement" | "complete";
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 9) {
    throw new Error("Complete Step 8 before success stories.");
  }
  await assertStepIsActive({ record, stepNumber: 9 });

  let nextCount = record.session.successStoryCount;
  if (input.storyAction === "increment") {
    nextCount += 1;
  } else if (input.storyAction === "decrement") {
    nextCount = Math.max(0, nextCount - 1);
  } else {
    const validationError = validateStep9CanComplete(record.session.successStoryCount);
    if (validationError) {
      throw new Error(validationError);
    }
    return updateSessionData({
      sessionId: input.sessionId,
      memberId: input.memberId,
      sessionPatch: {
        current_step: getStepAfterCompletion(9),
        success_story_count: record.session.successStoryCount,
      },
      dataJson: record.data.dataJson,
    });
  }

  const supabase = requireServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("consultation_sessions")
    .update({ success_story_count: nextCount, updated_at: now })
    .eq("id", input.sessionId)
    .eq("owner_member_id", input.memberId);

  if (error) {
    throw new Error(error.message);
  }

  return loadSessionRecord(input);
}

export async function saveConsultationStep10(input: {
  sessionId: string;
  memberId: string;
  interest: ConsultationMethodInterest;
  notes?: string;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 10) {
    throw new Error("Complete Step 9 before method interest.");
  }
  await assertStepIsActive({ record, stepNumber: 10 });

  const validationError = validateStep10Submission({ interest: input.interest });
  if (validationError) {
    throw new Error(validationError);
  }

  const now = new Date().toISOString();
  const methodInterest = normalizeMethodInterestData({
    interest: input.interest,
    notes: input.notes,
    decidedAt: now,
  });
  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    methodInterest,
  };
  const outcome = resolveStep10Outcome(input.interest);

  if (outcome.type === "follow_up_pause") {
    return updateSessionData({
      sessionId: input.sessionId,
      memberId: input.memberId,
      sessionPatch: {
        current_step: 10,
        status: "follow_up",
      },
      dataJson: nextDataJson,
    });
  }

  return updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: {
      current_step: getStepAfterCompletion(10),
      status: "in_progress",
    },
    dataJson: nextDataJson,
  });
}

export async function saveConsultationStep11(input: {
  sessionId: string;
  memberId: string;
  acknowledged: boolean;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 11) {
    throw new Error("Complete Step 10 before education.");
  }
  await assertStepIsActive({ record, stepNumber: 11 });

  const now = new Date().toISOString();
  const education = normalizeEducationData({
    goalType: record.data.dataJson.goals?.goalType ?? "other",
    acknowledged: input.acknowledged,
    acknowledgedAt: input.acknowledged ? now : undefined,
  });
  const validationError = validateStep11CanComplete(education);
  if (validationError) {
    throw new Error(validationError);
  }

  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    education,
  };

  return updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: { current_step: getStepAfterCompletion(11) },
    dataJson: nextDataJson,
  });
}

export async function saveConsultationStep12(input: {
  sessionId: string;
  memberId: string;
  cooperation: Partial<ConsultationCooperationData>;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 12) {
    throw new Error("Complete Step 11 before cooperation review.");
  }
  await assertStepIsActive({ record, stepNumber: 12 });

  const cooperation = normalizeCooperationData(input.cooperation ?? {});
  const validationError = validateStep12CanComplete(cooperation);
  if (validationError) {
    throw new Error(validationError);
  }

  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    cooperation,
  };

  return updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: { current_step: getStepAfterCompletion(12) },
    dataJson: nextDataJson,
  });
}

export async function saveConsultationStep13(input: {
  sessionId: string;
  memberId: string;
  meals: Partial<ConsultationMealsData>;
  services: Partial<ConsultationServicesData>;
}): Promise<ConsultationSessionRecord> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 13) {
    throw new Error("Complete Step 12 before meals and services.");
  }
  await assertStepIsActive({ record, stepNumber: 13 });

  const meals = normalizeMealsData(input.meals ?? {});
  const services = normalizeServicesData({
    ...input.services,
    explained: input.services?.explained,
    explainedAt: input.services?.explained ? new Date().toISOString() : undefined,
  });
  const validationError = validateStep13CanComplete({ meals, services });
  if (validationError) {
    throw new Error(validationError);
  }

  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    meals,
    services,
  };

  return updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: { current_step: getStepAfterCompletion(13) },
    dataJson: nextDataJson,
  });
}

export async function completeConsultationStep14(input: {
  sessionId: string;
  memberId: string;
  outcome: Partial<ConsultationOutcomeData>;
}): Promise<{ record: ConsultationSessionRecord; emitConsultationActivity: boolean }> {
  const record = await loadSessionRecord(input);
  if (record.session.currentStep < 14) {
    throw new Error("Complete Step 13 before final outcome.");
  }
  await assertStepIsActive({ record, stepNumber: 14 });

  const now = new Date().toISOString();
  const outcome = normalizeOutcomeData({
    ...input.outcome,
    decidedAt: now,
  });
  const validationError = validateStep14Submission({ outcome: outcome.outcome });
  if (validationError) {
    throw new Error(validationError);
  }

  const nextStatus = mapOutcomeToSessionStatus(outcome.outcome);
  const customer = await loadCustomerProfile({
    customerId: record.session.customerId,
    memberId: input.memberId,
  });
  const bodyRecord = await loadBodyRecordForBrief(record.session.bodyCompositionRecordId);

  const briefSnapshot = buildConsultationBriefSnapshot({
    session: {
      ...record.session,
      status: nextStatus,
      successStoryCount: record.session.successStoryCount,
    },
    dataJson: {
      ...record.data.dataJson,
      outcome,
    },
    customer: {
      displayName: customer.display_name,
      phone: customer.phone ?? undefined,
      sex: (customer.sex as import("@/types/customer").CustomerSex | null) ?? undefined,
      birthDate: customer.birth_date ?? undefined,
      region: customer.region ?? undefined,
      occupation: customer.occupation ?? undefined,
      heightCm: customer.height_cm ?? undefined,
    },
    bodyRecord,
    generatedAt: now,
  });

  const nextDataJson: ConsultationDataJson = {
    ...record.data.dataJson,
    outcome,
  };

  const updated = await updateSessionData({
    sessionId: input.sessionId,
    memberId: input.memberId,
    sessionPatch: {
      current_step: 14,
      status: nextStatus,
      completed_at: now,
      brief_snapshot: briefSnapshot,
    },
    dataJson: nextDataJson,
  });

  return {
    record: updated,
    emitConsultationActivity: shouldEmitConsultationActivityForOutcome(outcome.outcome),
  };
}

export async function getConsultationBrief(input: {
  sessionId: string;
  memberId: string;
}): Promise<ConsultationBriefSnapshot> {
  const record = await loadSessionRecord(input);
  if (record.session.briefSnapshot) {
    return record.session.briefSnapshot;
  }

  const customer = await loadCustomerProfile({
    customerId: record.session.customerId,
    memberId: input.memberId,
  });
  const bodyRecord = await loadBodyRecordForBrief(record.session.bodyCompositionRecordId);

  return buildConsultationBriefSnapshot({
    session: record.session,
    dataJson: record.data.dataJson,
    customer: {
      displayName: customer.display_name,
      phone: customer.phone ?? undefined,
      sex: (customer.sex as import("@/types/customer").CustomerSex | null) ?? undefined,
      birthDate: customer.birth_date ?? undefined,
      region: customer.region ?? undefined,
      occupation: customer.occupation ?? undefined,
      heightCm: customer.height_cm ?? undefined,
    },
    bodyRecord,
  });
}

export function serializeConsultationSession(record: ConsultationSessionRecord) {
  return {
    session: record.session,
    data: record.data,
  };
}
