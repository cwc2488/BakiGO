import { getConsultationSession } from "@/lib/consultation/consultation-service";
import {
  buildBarrierInsightInputSnapshot,
  buildBodySummary,
  buildMotivationInsightInputSnapshot,
  hasMotivationInsightInput,
} from "@/lib/consultation/ai/build-input-snapshot";
import { CONSULTATION_AI_MAX_REGENERATIONS } from "@/lib/consultation/ai/constants";
import {
  ConsultationAiConfigurationError,
  createConsultationAiProvider,
} from "@/lib/consultation/ai/provider";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type {
  BarrierInsightInputSnapshot,
  ConsultationAiApiResponse,
  ConsultationAiOutputRecord,
  ConsultationAiPointKey,
  MotivationInsightInputSnapshot,
} from "@/types/consultation-ai";
import {
  CONSULTATION_AI_POINT_KEYS,
} from "@/types/consultation-ai";
import type {
  ConsultationBarriersData,
  ConsultationReadinessData,
} from "@/types/consultation";

function requireServiceClient() {
  if (!isSupabaseServiceConfigured()) {
    throw new Error("Consultation service unavailable.");
  }
  return createSupabaseServiceClient();
}

type AiOutputDbRow = {
  id: string;
  session_id: string;
  owner_member_id: string;
  point_key: ConsultationAiPointKey;
  input_snapshot: MotivationInsightInputSnapshot | BarrierInsightInputSnapshot;
  output_json: ConsultationAiOutputRecord["outputJson"];
  model: string | null;
  status: ConsultationAiOutputRecord["status"];
  error_message: string | null;
  regeneration_count: number;
  created_at: string;
  updated_at: string;
};

function mapAiOutput(row: AiOutputDbRow): ConsultationAiOutputRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    ownerMemberId: row.owner_member_id,
    pointKey: row.point_key,
    inputSnapshot: row.input_snapshot,
    outputJson: row.output_json,
    model: row.model,
    status: row.status,
    errorMessage: row.error_message,
    regenerationCount: row.regeneration_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadBodySummaryForSession(input: {
  bodyCompositionRecordId?: string;
  customerId: string;
  memberId: string;
}) {
  if (!input.bodyCompositionRecordId) {
    return undefined;
  }

  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("body_composition_records")
    .select("weight_kg, body_fat_percent, bmi, skeletal_muscle_kg, customer_id")
    .eq("id", input.bodyCompositionRecordId)
    .maybeSingle();

  if (error || !data) {
    return undefined;
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("owner_member_id")
    .eq("id", data.customer_id)
    .maybeSingle();

  if (!customer || customer.owner_member_id !== input.memberId || data.customer_id !== input.customerId) {
    return undefined;
  }

  return buildBodySummary(data);
}

export async function getConsultationAiOutput(input: {
  sessionId: string;
  memberId: string;
  pointKey: ConsultationAiPointKey;
}): Promise<ConsultationAiOutputRecord | null> {
  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("consultation_ai_outputs")
    .select("*")
    .eq("session_id", input.sessionId)
    .eq("point_key", input.pointKey)
    .eq("owner_member_id", input.memberId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data ? mapAiOutput(data as AiOutputDbRow) : null;
}

async function persistAiOutput(input: {
  sessionId: string;
  memberId: string;
  pointKey: ConsultationAiPointKey;
  inputSnapshot: MotivationInsightInputSnapshot | BarrierInsightInputSnapshot;
  outputJson: ConsultationAiOutputRecord["outputJson"];
  model: string | null;
  status: ConsultationAiOutputRecord["status"];
  errorMessage: string | null;
  regenerationCount: number;
}): Promise<ConsultationAiOutputRecord> {
  const supabase = requireServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("consultation_ai_outputs")
    .upsert(
      {
        session_id: input.sessionId,
        owner_member_id: input.memberId,
        point_key: input.pointKey,
        input_snapshot: input.inputSnapshot,
        output_json: input.outputJson,
        model: input.model,
        status: input.status,
        error_message: input.errorMessage,
        regeneration_count: input.regenerationCount,
        updated_at: now,
      },
      { onConflict: "session_id,point_key" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to persist consultation AI output.");
  }

  return mapAiOutput(data as AiOutputDbRow);
}

function canRegenerate(record: ConsultationAiOutputRecord | null): boolean {
  if (!record) {
    return true;
  }
  return record.regenerationCount < CONSULTATION_AI_MAX_REGENERATIONS;
}

function nextRegenerationCount(
  existing: ConsultationAiOutputRecord | null,
  regenerate: boolean,
): number {
  if (!existing) {
    return 0;
  }
  return regenerate ? existing.regenerationCount + 1 : existing.regenerationCount;
}

export async function generateMotivationInsight(input: {
  sessionId: string;
  memberId: string;
  regenerate?: boolean;
}): Promise<ConsultationAiApiResponse> {
  const record = await getConsultationSession({
    sessionId: input.sessionId,
    memberId: input.memberId,
  });
  const existing = await getConsultationAiOutput({
    sessionId: input.sessionId,
    memberId: input.memberId,
    pointKey: CONSULTATION_AI_POINT_KEYS.MOTIVATION_INSIGHT,
  });

  if (input.regenerate && existing && !canRegenerate(existing)) {
    return {
      ok: false,
      output: existing,
      error: "已達重新產生上限。",
      canRegenerate: false,
    };
  }

  const bodySummary = await loadBodySummaryForSession({
    bodyCompositionRecordId: record.session.bodyCompositionRecordId,
    customerId: record.session.customerId,
    memberId: input.memberId,
  });
  const inputSnapshot = buildMotivationInsightInputSnapshot({
    dataJson: record.data.dataJson,
    bodySummary,
  });

  if (!hasMotivationInsightInput(inputSnapshot)) {
    return {
      ok: false,
      error: "尚無足夠動機資料。",
      canRegenerate: false,
    };
  }

  if (existing?.status === "completed" && !input.regenerate) {
    return {
      ok: true,
      output: existing,
      canRegenerate: canRegenerate(existing),
    };
  }

  try {
    const provider = createConsultationAiProvider();
    const generated = await provider.generateMotivationInsight(inputSnapshot);
    const saved = await persistAiOutput({
      sessionId: input.sessionId,
      memberId: input.memberId,
      pointKey: CONSULTATION_AI_POINT_KEYS.MOTIVATION_INSIGHT,
      inputSnapshot,
      outputJson: generated.output,
      model: generated.model,
      status: "completed",
      errorMessage: null,
      regenerationCount: nextRegenerationCount(existing, Boolean(input.regenerate)),
    });
    return {
      ok: true,
      output: saved,
      canRegenerate: canRegenerate(saved),
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "AI insight unavailable.";
    const failed = await persistAiOutput({
      sessionId: input.sessionId,
      memberId: input.memberId,
      pointKey: CONSULTATION_AI_POINT_KEYS.MOTIVATION_INSIGHT,
      inputSnapshot,
      outputJson: null,
      model: null,
      status: "failed",
      errorMessage: message,
      regenerationCount: nextRegenerationCount(existing, Boolean(input.regenerate)),
    });
    return {
      ok: false,
      output: failed,
      error: message,
      canRegenerate:
        caught instanceof ConsultationAiConfigurationError ? false : canRegenerate(failed),
    };
  }
}

export async function generateBarrierInsight(input: {
  sessionId: string;
  memberId: string;
  regenerate?: boolean;
  barrierDraft?: ConsultationBarriersData;
  readinessDraft?: Pick<
    ConsultationReadinessData,
    "readyIfBarrierSolved" | "notReadyReason" | "followUpNotes"
  >;
}): Promise<ConsultationAiApiResponse> {
  const record = await getConsultationSession({
    sessionId: input.sessionId,
    memberId: input.memberId,
  });
  const existing = await getConsultationAiOutput({
    sessionId: input.sessionId,
    memberId: input.memberId,
    pointKey: CONSULTATION_AI_POINT_KEYS.BARRIER_INSIGHT,
  });

  if (input.regenerate && existing && !canRegenerate(existing)) {
    return {
      ok: false,
      output: existing,
      error: "已達重新產生上限。",
      canRegenerate: false,
    };
  }

  const bodySummary = await loadBodySummaryForSession({
    bodyCompositionRecordId: record.session.bodyCompositionRecordId,
    customerId: record.session.customerId,
    memberId: input.memberId,
  });
  const inputSnapshot = buildBarrierInsightInputSnapshot({
    session: record.session,
    dataJson: record.data.dataJson,
    bodySummary,
    barrierDraft: input.barrierDraft,
    readinessDraft: input.readinessDraft,
  });

  if (!inputSnapshot) {
    return {
      ok: false,
      error: "目前決心分數不在阻礙洞察適用範圍。",
      canRegenerate: false,
    };
  }

  if (existing?.status === "completed" && !input.regenerate) {
    return {
      ok: true,
      output: existing,
      canRegenerate: canRegenerate(existing),
    };
  }

  try {
    const provider = createConsultationAiProvider();
    const generated = await provider.generateBarrierInsight(inputSnapshot);
    const saved = await persistAiOutput({
      sessionId: input.sessionId,
      memberId: input.memberId,
      pointKey: CONSULTATION_AI_POINT_KEYS.BARRIER_INSIGHT,
      inputSnapshot,
      outputJson: generated.output,
      model: generated.model,
      status: "completed",
      errorMessage: null,
      regenerationCount: nextRegenerationCount(existing, Boolean(input.regenerate)),
    });
    return {
      ok: true,
      output: saved,
      canRegenerate: canRegenerate(saved),
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "AI insight unavailable.";
    const failed = await persistAiOutput({
      sessionId: input.sessionId,
      memberId: input.memberId,
      pointKey: CONSULTATION_AI_POINT_KEYS.BARRIER_INSIGHT,
      inputSnapshot,
      outputJson: null,
      model: null,
      status: "failed",
      errorMessage: message,
      regenerationCount: nextRegenerationCount(existing, Boolean(input.regenerate)),
    });
    return {
      ok: false,
      output: failed,
      error: message,
      canRegenerate:
        caught instanceof ConsultationAiConfigurationError ? false : canRegenerate(failed),
    };
  }
}
