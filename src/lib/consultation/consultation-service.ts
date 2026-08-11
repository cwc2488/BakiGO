import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  getStepAfterCompletion,
  normalizeHealthData,
} from "@/lib/consultation/consultation-flow-engine";
import type {
  ConsultationData,
  ConsultationDataJson,
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

export function serializeConsultationSession(record: ConsultationSessionRecord) {
  return {
    session: record.session,
    data: record.data,
  };
}
