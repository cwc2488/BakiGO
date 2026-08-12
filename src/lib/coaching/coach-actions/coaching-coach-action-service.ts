import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { CoachingServiceError, getCoachingEnrollmentForCoach } from "@/lib/coaching/coaching-service";
import type { CoachingEvidenceRef } from "@/types/coaching-timeline";
import {
  inferCoachActionMaterial,
  isCoachingCoachActionStatus,
  isCoachingCoachActionType,
  type CoachingCoachActionRecord,
  type CoachingCoachActionStatus,
  type CoachingCoachActionType,
} from "@/types/coaching-coach-actions";

function mapRow(row: Record<string, unknown>): CoachingCoachActionRecord {
  const actionTypeRaw = String(row.action_type ?? "");
  const statusRaw = String(row.status ?? "open");
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id),
    customerId: String(row.customer_id),
    ownerMemberId: String(row.owner_member_id),
    actionType: isCoachingCoachActionType(actionTypeRaw) ? actionTypeRaw : "note",
    status: isCoachingCoachActionStatus(statusRaw) ? statusRaw : "open",
    note: row.note != null ? String(row.note) : null,
    relatedReasonCodes: Array.isArray(row.related_reason_codes)
      ? row.related_reason_codes.map((item) => String(item))
      : [],
    evidenceRefs: Array.isArray(row.evidence_refs)
      ? (row.evidence_refs as CoachingEvidenceRef[])
      : [],
    relatedLogDate: row.related_log_date != null ? String(row.related_log_date) : null,
    relatedMeasurementId: row.related_measurement_id != null ? String(row.related_measurement_id) : null,
    isMaterial: Boolean(row.is_material),
    supersededBy: row.superseded_by != null ? String(row.superseded_by) : null,
    createdAt: String(row.created_at ?? ""),
    resolvedAt: row.resolved_at != null ? String(row.resolved_at) : null,
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listCoachingCoachActionsForEnrollment(input: {
  enrollmentId: string;
  ownerMemberId: string;
  limit?: number;
}): Promise<CoachingCoachActionRecord[]> {
  await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_coach_actions")
    .select("*")
    .eq("enrollment_id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .neq("status", "superseded")
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("does not exist")) {
      return [];
    }
    throw new CoachingServiceError(error.message, 500);
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

/** Batch load for Command Center — one query, owner-scoped. Soft-fails if table missing. */
export async function listRecentCoachActionsForEnrollments(input: {
  ownerMemberId: string;
  enrollmentIds: string[];
  sinceIso?: string;
  limit?: number;
}): Promise<Map<string, CoachingCoachActionRecord[]>> {
  const map = new Map<string, CoachingCoachActionRecord[]>();
  if (input.enrollmentIds.length === 0) return map;

  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("coaching_coach_actions")
    .select("*")
    .eq("owner_member_id", input.ownerMemberId)
    .in("enrollment_id", input.enrollmentIds)
    .neq("status", "superseded")
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 500);

  if (input.sinceIso) {
    query = query.gte("created_at", input.sinceIso);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "PGRST205" || error.message.includes("does not exist")) {
      return map;
    }
    throw new CoachingServiceError(error.message, 500);
  }

  for (const row of data ?? []) {
    const mapped = mapRow(row as Record<string, unknown>);
    const list = map.get(mapped.enrollmentId) ?? [];
    list.push(mapped);
    map.set(mapped.enrollmentId, list);
  }
  return map;
}

export async function createCoachingCoachAction(input: {
  enrollmentId: string;
  ownerMemberId: string;
  actionType: CoachingCoachActionType;
  note?: string | null;
  relatedReasonCodes?: string[];
  evidenceRefs?: CoachingEvidenceRef[];
  relatedLogDate?: string | null;
  relatedMeasurementId?: string | null;
  /** Optional explicit status; defaults from actionType. */
  status?: CoachingCoachActionStatus;
  resolve?: boolean;
}): Promise<CoachingCoachActionRecord> {
  const enrollment = await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });

  const note = input.note?.trim() || null;
  const status: CoachingCoachActionStatus =
    input.status ??
    (input.resolve
      ? "resolved"
      : input.actionType === "acknowledged"
        ? "acknowledged"
        : input.actionType === "follow_up"
          ? "follow_up"
          : "open");
  const resolvedAt = status === "resolved" ? new Date().toISOString() : null;
  const isMaterial = inferCoachActionMaterial({ actionType: input.actionType, note });

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_coach_actions")
    .insert({
      enrollment_id: enrollment.id,
      customer_id: enrollment.customerId,
      owner_member_id: input.ownerMemberId,
      action_type: input.actionType,
      status,
      note,
      related_reason_codes: input.relatedReasonCodes ?? [],
      evidence_refs: input.evidenceRefs ?? [],
      related_log_date: input.relatedLogDate ?? null,
      related_measurement_id: input.relatedMeasurementId ?? null,
      is_material: isMaterial,
      resolved_at: resolvedAt,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
  return mapRow(data as Record<string, unknown>);
}

export async function updateCoachingCoachAction(input: {
  actionId: string;
  enrollmentId: string;
  ownerMemberId: string;
  status?: CoachingCoachActionStatus;
  note?: string | null;
  resolve?: boolean;
}): Promise<CoachingCoachActionRecord> {
  await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.status) patch.status = input.status;
  if (input.note !== undefined) {
    const note = input.note?.trim() || null;
    patch.note = note;
    patch.is_material = inferCoachActionMaterial({
      actionType: "note",
      note,
    });
  }
  if (input.resolve || input.status === "resolved") {
    patch.status = "resolved";
    patch.resolved_at = new Date().toISOString();
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_coach_actions")
    .update(patch)
    .eq("id", input.actionId)
    .eq("enrollment_id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
  if (!data) {
    throw new CoachingServiceError("Not found", 404);
  }
  return mapRow(data as Record<string, unknown>);
}
