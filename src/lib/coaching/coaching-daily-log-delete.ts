import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { CoachingServiceError, getCoachingEnrollmentForCoach } from "@/lib/coaching/coaching-service";
import { COACHING_AI_POINT_KEY } from "@/types/coaching-ai";

export type SoftDeletedCoachingRecord = {
  logId: string;
  logDate: string;
  enrollmentId: string;
  deletedAt: string;
  deletedBy: string;
  aiOutputId: string | null;
};

/**
 * Coach soft-deletes one daily coaching record for an authorized customer.
 * Ownership is resolved server-side from the authenticated member id — never from client body.
 */
export async function softDeleteCoachingDailyLogForCoach(input: {
  enrollmentId: string;
  logId: string;
  ownerMemberId: string;
}): Promise<SoftDeletedCoachingRecord> {
  if (!input.ownerMemberId) {
    throw new CoachingServiceError("Unauthorized", 401);
  }

  const enrollment = await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });

  const supabase = createSupabaseServiceClient();
  const { data: logRow, error: logError } = await supabase
    .from("coaching_daily_logs")
    .select("id, enrollment_id, owner_member_id, log_date, deleted_at")
    .eq("id", input.logId)
    .maybeSingle();

  if (logError) {
    throw new CoachingServiceError(logError.message, 500);
  }
  if (!logRow) {
    throw new CoachingServiceError("Not found", 404);
  }
  if (String(logRow.enrollment_id) !== enrollment.id || String(logRow.owner_member_id) !== input.ownerMemberId) {
    throw new CoachingServiceError("Forbidden", 403);
  }

  const logDate = String(logRow.log_date);
  const deletedAt =
    logRow.deleted_at != null ? String(logRow.deleted_at) : new Date().toISOString();

  if (logRow.deleted_at == null) {
    const { error: updateLogError } = await supabase
      .from("coaching_daily_logs")
      .update({
        deleted_at: deletedAt,
        deleted_by: input.ownerMemberId,
        updated_at: deletedAt,
      })
      .eq("id", input.logId)
      .eq("enrollment_id", enrollment.id)
      .eq("owner_member_id", input.ownerMemberId)
      .is("deleted_at", null);

    if (updateLogError) {
      throw new CoachingServiceError(updateLogError.message, 500);
    }
  }

  const { data: aiRow, error: aiLookupError } = await supabase
    .from("coaching_ai_outputs")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("log_date", logDate)
    .eq("point_key", COACHING_AI_POINT_KEY)
    .is("deleted_at", null)
    .maybeSingle();

  if (aiLookupError) {
    throw new CoachingServiceError(aiLookupError.message, 500);
  }

  let aiOutputId = aiRow?.id ? String(aiRow.id) : null;
  if (aiOutputId) {
    const { error: aiUpdateError } = await supabase
      .from("coaching_ai_outputs")
      .update({
        deleted_at: deletedAt,
        deleted_by: input.ownerMemberId,
        updated_at: deletedAt,
      })
      .eq("id", aiOutputId)
      .is("deleted_at", null);

    if (aiUpdateError) {
      throw new CoachingServiceError(aiUpdateError.message, 500);
    }

    const { error: jobError } = await supabase
      .from("coaching_generation_jobs")
      .update({
        status: "completed",
        locked_at: null,
        locked_by: null,
        last_error: "daily_log_deleted",
        updated_at: deletedAt,
      })
      .eq("output_id", aiOutputId)
      .in("status", ["queued", "processing"]);

    if (jobError) {
      throw new CoachingServiceError(jobError.message, 500);
    }
  } else {
    const { data: alreadyDeletedAi } = await supabase
      .from("coaching_ai_outputs")
      .select("id")
      .eq("enrollment_id", enrollment.id)
      .eq("log_date", logDate)
      .eq("point_key", COACHING_AI_POINT_KEY)
      .not("deleted_at", "is", null)
      .maybeSingle();
    aiOutputId = alreadyDeletedAi?.id ? String(alreadyDeletedAi.id) : null;
  }

  return {
    logId: input.logId,
    logDate,
    enrollmentId: enrollment.id,
    deletedAt,
    deletedBy: input.ownerMemberId,
    aiOutputId,
  };
}
