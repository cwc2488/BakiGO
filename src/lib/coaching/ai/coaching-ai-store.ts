import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  COACHING_AI_POINT_KEY,
  type CoachingAiOutputRecord,
  type CoachingAiOutputStatus,
  type CoachingDailyGenerationOutputJson,
  type CoachingGenerationInput,
  type CoachingGenerationJobRecord,
  type CoachingGenerationJobStatus,
  type CoachingInterventionLevel,
} from "@/types/coaching-ai";

function asInterventionLevel(value: unknown): CoachingInterventionLevel | null {
  if (value === "normal" || value === "watch" || value === "coach_attention") {
    return value;
  }
  return null;
}

export function mapCoachingAiOutputRow(row: Record<string, unknown>): CoachingAiOutputRecord {
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id),
    customerId: String(row.customer_id),
    ownerMemberId: String(row.owner_member_id),
    logDate: String(row.log_date),
    pointKey: COACHING_AI_POINT_KEY,
    inputFingerprint: String(row.input_fingerprint ?? ""),
    inputSnapshot: (row.input_snapshot ?? {}) as CoachingGenerationInput,
    outputJson: (row.output_json as CoachingDailyGenerationOutputJson | null) ?? null,
    model: row.model != null ? String(row.model) : null,
    promptVersion: row.prompt_version != null ? String(row.prompt_version) : null,
    status: String(row.status) as CoachingAiOutputStatus,
    errorMessage: row.error_message != null ? String(row.error_message) : null,
    regenerationCount: Number(row.regeneration_count ?? 0),
    aiProposedInterventionLevel: asInterventionLevel(row.ai_proposed_intervention_level),
    finalInterventionLevel: asInterventionLevel(row.final_intervention_level),
    startedAt: row.started_at != null ? String(row.started_at) : null,
    completedAt: row.completed_at != null ? String(row.completed_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapCoachingGenerationJobRow(row: Record<string, unknown>): CoachingGenerationJobRecord {
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id),
    customerId: String(row.customer_id),
    ownerMemberId: String(row.owner_member_id),
    logDate: String(row.log_date),
    outputId: String(row.output_id),
    inputFingerprint: String(row.input_fingerprint ?? ""),
    status: String(row.status) as CoachingGenerationJobStatus,
    attemptCount: Number(row.attempt_count ?? 0),
    availableAt: String(row.available_at ?? ""),
    lockedAt: row.locked_at != null ? String(row.locked_at) : null,
    lockedBy: row.locked_by != null ? String(row.locked_by) : null,
    lastError: row.last_error != null ? String(row.last_error) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function getCoachingAiOutputForDay(input: {
  enrollmentId: string;
  logDate: string;
}): Promise<CoachingAiOutputRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_ai_outputs")
    .select("*")
    .eq("enrollment_id", input.enrollmentId)
    .eq("log_date", input.logDate)
    .eq("point_key", COACHING_AI_POINT_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data ? mapCoachingAiOutputRow(data as Record<string, unknown>) : null;
}

export async function listCoachingAiOutputsForEnrollment(input: {
  enrollmentId: string;
  limit?: number;
}): Promise<CoachingAiOutputRecord[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_ai_outputs")
    .select("*")
    .eq("enrollment_id", input.enrollmentId)
    .eq("point_key", COACHING_AI_POINT_KEY)
    .order("log_date", { ascending: false })
    .limit(input.limit ?? 14);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapCoachingAiOutputRow(row as Record<string, unknown>));
}

export async function listCoachingAiOutputsForOwnerDay(input: {
  ownerMemberId: string;
  logDate: string;
  enrollmentIds?: string[];
}): Promise<CoachingAiOutputRecord[]> {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("coaching_ai_outputs")
    .select("*")
    .eq("owner_member_id", input.ownerMemberId)
    .eq("log_date", input.logDate)
    .eq("point_key", COACHING_AI_POINT_KEY);

  if (input.enrollmentIds && input.enrollmentIds.length > 0) {
    query = query.in("enrollment_id", input.enrollmentIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapCoachingAiOutputRow(row as Record<string, unknown>));
}

export async function listActiveGenerationJobsForOutput(outputId: string): Promise<CoachingGenerationJobRecord[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_generation_jobs")
    .select("*")
    .eq("output_id", outputId)
    .in("status", ["queued", "processing"]);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapCoachingGenerationJobRow(row as Record<string, unknown>));
}

/** Count jobs that are claimable now (queued + available_at <= now). For claimed=0 observability. */
export async function countClaimableGenerationJobs(): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { count, error } = await supabase
    .from("coaching_generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lte("available_at", nowIso);
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

/** Count jobs currently processing (may explain claimed=0 with work in flight). */
export async function countProcessingGenerationJobs(): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { count, error } = await supabase
    .from("coaching_generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "processing");
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function getCoachDirectivesForEnrollment(enrollmentId: string): Promise<{
  currentFocus: string | null;
  currentPriority: string | null;
  coachInstruction: string | null;
  effectiveFrom: string | null;
} | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_coach_directives")
    .select("current_focus, current_priority, coach_instruction, effective_from, status")
    .eq("enrollment_id", enrollmentId)
    .eq("status", "active")
    .order("effective_from", { ascending: false })
    .limit(8);

  if (error) {
    // Table may not exist yet during partial rollout — treat as no directives.
    if (error.code === "PGRST205" || error.message.includes("does not exist")) {
      return null;
    }
    throw new Error(error.message);
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return null;
  }
  const lines = rows
    .map((row) => {
      const text =
        (row.coach_instruction != null ? String(row.coach_instruction).trim() : "") ||
        (row.current_focus != null ? String(row.current_focus).trim() : "");
      return text;
    })
    .filter(Boolean);
  if (lines.length === 0) return null;
  return {
    currentFocus: lines[0] ?? null,
    currentPriority: rows[0]?.current_priority != null ? String(rows[0].current_priority) : null,
    coachInstruction: lines.join("；"),
    effectiveFrom: rows[0]?.effective_from != null ? String(rows[0].effective_from) : null,
  };
}

export async function upsertPendingCoachingAiOutput(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
  fingerprint: string;
  generationInput: CoachingGenerationInput;
  regenerationCount: number;
}): Promise<CoachingAiOutputRecord> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const row = {
    enrollment_id: input.enrollmentId,
    customer_id: input.customerId,
    owner_member_id: input.ownerMemberId,
    log_date: input.logDate,
    point_key: COACHING_AI_POINT_KEY,
    input_fingerprint: input.fingerprint,
    input_snapshot: input.generationInput,
    output_json: null,
    model: null,
    prompt_version: null,
    status: "pending",
    error_message: null,
    regeneration_count: input.regenerationCount,
    ai_proposed_intervention_level: null,
    final_intervention_level: null,
    started_at: null,
    completed_at: null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("coaching_ai_outputs")
    .upsert(row, { onConflict: "enrollment_id,log_date,point_key" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return mapCoachingAiOutputRow(data as Record<string, unknown>);
}

export async function insertQueuedGenerationJob(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
  outputId: string;
  fingerprint: string;
  availableAt?: string;
}): Promise<CoachingGenerationJobRecord> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("coaching_generation_jobs")
    .insert({
      enrollment_id: input.enrollmentId,
      customer_id: input.customerId,
      owner_member_id: input.ownerMemberId,
      log_date: input.logDate,
      output_id: input.outputId,
      input_fingerprint: input.fingerprint,
      status: "queued",
      attempt_count: 0,
      available_at: input.availableAt ?? now,
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    // Concurrent enqueue of same fingerprint — treat as success via existing active job.
    if (error.code === "23505") {
      const active = await listActiveGenerationJobsForOutput(input.outputId);
      const match = active.find((job) => job.inputFingerprint === input.fingerprint);
      if (match) {
        return match;
      }
    }
    throw new Error(error.message);
  }

  return mapCoachingGenerationJobRow(data as Record<string, unknown>);
}

export async function markCoachingAiOutputProcessing(outputId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("coaching_ai_outputs")
    .update({
      status: "processing",
      started_at: now,
      error_message: null,
      updated_at: now,
    })
    .eq("id", outputId)
    .in("status", ["pending", "failed", "processing"]);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markCoachingAiOutputCompleted(input: {
  outputId: string;
  fingerprint: string;
  generationInput: CoachingGenerationInput;
  outputJson: CoachingDailyGenerationOutputJson;
  model: string;
  promptVersion: string;
  finalInterventionLevel: CoachingInterventionLevel;
  aiProposedInterventionLevel: CoachingInterventionLevel | null;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("coaching_ai_outputs")
    .update({
      input_fingerprint: input.fingerprint,
      input_snapshot: input.generationInput,
      output_json: input.outputJson,
      model: input.model,
      prompt_version: input.promptVersion,
      status: "completed",
      error_message: null,
      ai_proposed_intervention_level: input.aiProposedInterventionLevel,
      final_intervention_level: input.finalInterventionLevel,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", input.outputId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markCoachingAiOutputFailed(input: {
  outputId: string;
  errorMessage: string;
  expectedFingerprint?: string;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  let query = supabase
    .from("coaching_ai_outputs")
    .update({
      status: "failed",
      error_message: input.errorMessage.slice(0, 500),
      updated_at: now,
      completed_at: now,
    })
    .eq("id", input.outputId)
    .neq("status", "completed");

  if (input.expectedFingerprint) {
    query = query.eq("input_fingerprint", input.expectedFingerprint);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}

export async function markGenerationJobCompleted(jobId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("coaching_generation_jobs")
    .update({
      status: "completed",
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: now,
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markGenerationJobSuperseded(jobId: string, reason: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("coaching_generation_jobs")
    .update({
      status: "completed",
      locked_at: null,
      locked_by: null,
      last_error: reason.slice(0, 500),
      updated_at: now,
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markGenerationJobFailedOrRetry(input: {
  jobId: string;
  attemptCount: number;
  lastError: string;
  availableAt: string | null;
  permanent: boolean;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("coaching_generation_jobs")
    .update(
      input.permanent
        ? {
            status: "failed",
            last_error: input.lastError.slice(0, 500),
            locked_at: null,
            locked_by: null,
            updated_at: now,
          }
        : {
            status: "queued",
            attempt_count: input.attemptCount,
            last_error: input.lastError.slice(0, 500),
            available_at: input.availableAt ?? now,
            locked_at: null,
            locked_by: null,
            updated_at: now,
          },
    )
    .eq("id", input.jobId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function reclaimStaleCoachingGenerationJobs(staleAfterMinutes = 15): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("reclaim_stale_coaching_generation_jobs", {
    p_stale_after_minutes: staleAfterMinutes,
  });
  if (error) {
    throw new Error(error.message);
  }
  return Number(data ?? 0);
}

export async function claimCoachingGenerationJobs(input: {
  limit: number;
  lockedBy: string;
}): Promise<CoachingGenerationJobRecord[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("claim_coaching_generation_jobs", {
    p_limit: input.limit,
    p_locked_by: input.lockedBy,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row: Record<string, unknown>) => mapCoachingGenerationJobRow(row));
}
