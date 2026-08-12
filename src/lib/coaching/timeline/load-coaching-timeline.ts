import {
  buildCoachingTimelineEvents,
  filterTimelineEvents,
  paginateTimelineEvents,
} from "@/lib/coaching/timeline/build-timeline-events";
import { mapBodyRecordRow } from "@/lib/coaching/ai/load-coaching-generation-context";
import { mapCoachingAiOutputRow } from "@/lib/coaching/ai/coaching-ai-store";
import { listCoachingCoachActionsForEnrollment } from "@/lib/coaching/coach-actions/coaching-coach-action-service";
import {
  CoachingServiceError,
  getCoachingEnrollmentForCoach,
} from "@/lib/coaching/coaching-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { COACHING_AI_POINT_KEY } from "@/types/coaching-ai";
import type { CoachingDailyLogDetail, CoachingMealEntryWithPhoto } from "@/types/coaching";
import type { CoachingTimelineFilter, CoachingTimelinePage } from "@/types/coaching-timeline";

function mapMealEntryLight(row: Record<string, unknown>): CoachingMealEntryWithPhoto {
  const photos = (row.coaching_meal_photos as Record<string, unknown>[] | null) ?? [];
  const photo = photos[0] ?? null;
  return {
    id: String(row.id),
    dailyLogId: String(row.daily_log_id),
    mealSlot: row.meal_slot as CoachingMealEntryWithPhoto["mealSlot"],
    textNote: row.text_note != null ? String(row.text_note) : null,
    eatenAt: row.eaten_at != null ? String(row.eaten_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    photo: photo
      ? {
          id: String(photo.id),
          mealEntryId: String(photo.meal_entry_id ?? row.id),
          storagePath: String(photo.storage_path),
          uploadedAt: String(photo.uploaded_at ?? ""),
          createdAt: String(photo.created_at ?? ""),
        }
      : null,
  };
}

function mapDailyLogLight(row: Record<string, unknown>): CoachingDailyLogDetail {
  const mealsRaw = (row.coaching_meal_entries as Record<string, unknown>[] | null) ?? [];
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id),
    customerId: String(row.customer_id),
    ownerMemberId: String(row.owner_member_id),
    logDate: String(row.log_date),
    waterMl: row.water_ml != null ? Number(row.water_ml) : null,
    exerciseNote: row.exercise_note != null ? String(row.exercise_note) : null,
    bowelMovementCount: row.bowel_movement_count != null ? Number(row.bowel_movement_count) : null,
    sleepDuration: row.sleep_duration != null ? String(row.sleep_duration) : null,
    sleepBedtime: row.sleep_bedtime != null ? String(row.sleep_bedtime) : null,
    sleepWakeTime: row.sleep_wake_time != null ? String(row.sleep_wake_time) : null,
    customerNote: row.customer_note != null ? String(row.customer_note) : null,
    submittedAt: row.submitted_at != null ? String(row.submitted_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    meals: mealsRaw.map(mapMealEntryLight),
  };
}

/**
 * Batch Timeline loader — ownership gated, fixed query plan:
 * 1) enrollment ownership
 * 2) daily logs + meals (+ photo paths, not signed URLs)
 * 3) AI outputs for enrollment
 * 4) body composition records for customer
 * 5) coach actions (Phase 3d)
 *
 * Photos are NOT signed here. Expand endpoint signs on demand.
 */
export async function loadCoachingTimelinePage(input: {
  enrollmentId: string;
  ownerMemberId: string;
  asOfLogDate: string;
  filter: CoachingTimelineFilter;
  cursor: string | null;
  limit?: number;
  focusDates?: string[];
  reasonCodes?: string[];
}): Promise<{ page: CoachingTimelinePage; queryCount: number }> {
  let queryCount = 0;

  const enrollment = await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });
  queryCount += 1;

  const supabase = createSupabaseServiceClient();
  const journeyStartDate = enrollment.startedAt.slice(0, 10);

  const { data: logRows, error: logsError } = await supabase
    .from("coaching_daily_logs")
    .select(
      `
      *,
      coaching_meal_entries (
        *,
        coaching_meal_photos (*)
      )
    `,
    )
    .eq("enrollment_id", enrollment.id)
    .eq("owner_member_id", input.ownerMemberId)
    .gte("log_date", journeyStartDate)
    .lte("log_date", input.asOfLogDate)
    .order("log_date", { ascending: false });
  queryCount += 1;
  if (logsError) {
    throw new CoachingServiceError(logsError.message, 500);
  }

  const logs = (logRows ?? []).map((row) => mapDailyLogLight(row as Record<string, unknown>));

  const { data: aiRows, error: aiError } = await supabase
    .from("coaching_ai_outputs")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .eq("owner_member_id", input.ownerMemberId)
    .eq("point_key", COACHING_AI_POINT_KEY)
    .gte("log_date", journeyStartDate)
    .lte("log_date", input.asOfLogDate)
    .order("log_date", { ascending: false });
  queryCount += 1;
  if (aiError) {
    throw new CoachingServiceError(aiError.message, 500);
  }
  const aiOutputs = (aiRows ?? []).map((row) => mapCoachingAiOutputRow(row as Record<string, unknown>));

  const { data: bodyRows, error: bodyError } = await supabase
    .from("body_composition_records")
    .select("*")
    .eq("customer_id", enrollment.customerId)
    .order("record_date", { ascending: true });
  queryCount += 1;
  if (bodyError) {
    throw new CoachingServiceError(bodyError.message, 500);
  }
  const bodyRecords = (bodyRows ?? []).map((row) => mapBodyRecordRow(row as Record<string, unknown>));

  const coachActions = await listCoachingCoachActionsForEnrollment({
    enrollmentId: enrollment.id,
    ownerMemberId: input.ownerMemberId,
    limit: 100,
  });
  queryCount += 1;

  const allEvents = buildCoachingTimelineEvents({
    enrollmentId: enrollment.id,
    enrollmentStartedAt: enrollment.startedAt,
    baselineBodyRecordId: enrollment.baselineBodyRecordId,
    asOfLogDate: input.asOfLogDate,
    journeyStartDate,
    logs,
    aiOutputs,
    bodyRecords,
    coachActions,
    focusDates: input.focusDates,
    reasonCodes: input.reasonCodes,
  });

  const filtered = filterTimelineEvents(allEvents, input.filter);
  const pageSlice = paginateTimelineEvents({
    events: filtered,
    cursor: input.cursor,
    limit: input.limit ?? 14,
  });

  return {
    queryCount,
    page: {
      enrollmentId: enrollment.id,
      asOfLogDate: input.asOfLogDate,
      filter: input.filter,
      events: pageSlice.events,
      nextCursor: pageSlice.nextCursor,
      hasMore: pageSlice.hasMore,
      focusDates: input.focusDates ?? [],
      reasonCodes: input.reasonCodes ?? [],
      meta: {
        openaiCalled: false,
        queryCount,
        nPlusOne: false,
      },
    },
  };
}
