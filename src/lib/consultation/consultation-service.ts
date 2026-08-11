import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  getStepAfterCompletion,
  normalizeBarriersData,
  normalizeGoalsData,
  normalizeHealthData,
  normalizeMotivationsData,
  normalizePreviousExperienceData,
  normalizeReadinessData,
  resolveStep8Outcome,
  validateCommitmentScore,
  validateStep6CanComplete,
  validateStep8Submission,
} from "@/lib/consultation/consultation-flow-engine";
import type {
  ConsultationBarriersData,
  ConsultationData,
  ConsultationDataJson,
  ConsultationGoalsData,
  ConsultationMotivationsData,
  ConsultationPreviousExperienceData,
  ConsultationReadinessData,
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
  brief_snapshot: Record<string, unknown> | null;
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
  if (input.record.session.currentStep !== input.stepNumber) {
    throw new Error(`Step ${input.stepNumber} is not the active step.`);
  }
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

export function serializeConsultationSession(record: ConsultationSessionRecord) {
  return {
    session: record.session,
    data: record.data,
  };
}
