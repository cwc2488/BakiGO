import { denseCalendarWindowStart } from "@/lib/coaching/attention/build-dense-submission-calendar";
import {
  assembleCommandCenter,
  type CommandCenterBatchCustomer,
  type CoachingCommandCenterResult,
} from "@/lib/coaching/attention/assemble-command-center";
import { mapCoachingAiOutputRow } from "@/lib/coaching/ai/coaching-ai-store";
import { mapBodyRecordRow } from "@/lib/coaching/ai/load-coaching-generation-context";
import { listRecentCoachActionsForEnrollments } from "@/lib/coaching/coach-actions/coaching-coach-action-service";
import { mapCoachActionToAttentionShape } from "@/types/coaching-coach-actions";
import { COACHING_NON_REPORTING_POLICY } from "@/lib/coaching/attention/coach-attention-policy";
import {
  CoachingServiceError,
  listActiveCoachingEnrollments,
} from "@/lib/coaching/coaching-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { COACHING_AI_POINT_KEY, type CoachingAiOutputRecord } from "@/types/coaching-ai";
import type { CoachingDailyLogDetail, CoachingMealEntryWithPhoto } from "@/types/coaching";
import type { BodyCompositionRecord } from "@/types/customer";

export type CommandCenterQueryAudit = {
  queryCount: number;
  queries: string[];
  nPlusOne: false;
  openaiCalled: false;
  parallelBatch: true;
};

function mapMealEntryLight(row: Record<string, unknown>): CoachingMealEntryWithPhoto {
  return {
    id: String(row.id),
    dailyLogId: String(row.daily_log_id),
    mealSlot: row.meal_slot as CoachingMealEntryWithPhoto["mealSlot"],
    textNote: row.text_note != null ? String(row.text_note) : null,
    eatenAt: row.eaten_at != null ? String(row.eaten_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    photo: null,
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

function pickLatestCompletedAiByEnrollment(
  rows: CoachingAiOutputRecord[],
): Map<string, CoachingAiOutputRecord> {
  const map = new Map<string, CoachingAiOutputRecord>();
  const sorted = [...rows].sort((a, b) => b.logDate.localeCompare(a.logDate));
  for (const row of sorted) {
    if (row.status !== "completed") continue;
    if (!map.has(row.enrollmentId)) {
      map.set(row.enrollmentId, row);
    }
  }
  return map;
}

/**
 * Batch Command Center loader.
 * Fixed query plan (no per-customer round trips):
 * 1) active enrollments for owner
 * 2–6) customers / logs / AI / body / coach-actions in parallel
 */
export async function loadCoachingCommandCenter(input: {
  ownerMemberId: string;
  asOfLogDate: string;
  asOfHourTaipei: number;
}): Promise<{ result: CoachingCommandCenterResult; audit: CommandCenterQueryAudit }> {
  const audit: CommandCenterQueryAudit = {
    queryCount: 0,
    queries: [],
    nPlusOne: false,
    openaiCalled: false,
    parallelBatch: true,
  };

  const enrollments = await listActiveCoachingEnrollments(input.ownerMemberId);
  audit.queryCount += 1;
  audit.queries.push("coaching_enrollments.active_by_owner");

  if (enrollments.length === 0) {
    return {
      result: assembleCommandCenter({
        ownerMemberId: input.ownerMemberId,
        asOfLogDate: input.asOfLogDate,
        asOfHourTaipei: input.asOfHourTaipei,
        customers: [],
      }),
      audit,
    };
  }

  const supabase = createSupabaseServiceClient();
  const enrollmentIds = enrollments.map((item) => item.id);
  const customerIds = enrollments.map((item) => item.customerId);
  const windowStart = denseCalendarWindowStart(
    input.asOfLogDate,
    COACHING_NON_REPORTING_POLICY.rollingWindowDays,
  );
  const sinceIso = new Date(
    Date.parse(`${input.asOfLogDate}T12:00:00.000+08:00`) - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [customersResult, logsResult, aiResult, bodyResult, actionsByEnrollment] = await Promise.all([
    supabase
      .from("customers")
      .select("id, display_name, phone")
      .in("id", customerIds)
      .eq("owner_member_id", input.ownerMemberId),
    supabase
      .from("coaching_daily_logs")
      .select(
        `
      *,
      coaching_meal_entries (*)
    `,
      )
      .eq("owner_member_id", input.ownerMemberId)
      .in("enrollment_id", enrollmentIds)
      .gte("log_date", windowStart)
      .lte("log_date", input.asOfLogDate)
      .order("log_date", { ascending: false }),
    supabase
      .from("coaching_ai_outputs")
      .select("*")
      .eq("owner_member_id", input.ownerMemberId)
      .in("enrollment_id", enrollmentIds)
      .eq("point_key", COACHING_AI_POINT_KEY)
      .gte("log_date", windowStart)
      .lte("log_date", input.asOfLogDate)
      .order("log_date", { ascending: false }),
    supabase
      .from("body_composition_records")
      .select("*")
      .in("customer_id", customerIds)
      .order("record_date", { ascending: false }),
    listRecentCoachActionsForEnrollments({
      ownerMemberId: input.ownerMemberId,
      enrollmentIds,
      sinceIso,
    }),
  ]);

  audit.queryCount += 5;
  audit.queries.push(
    "customers.by_owner_ids",
    "coaching_daily_logs.window_with_meals",
    "coaching_ai_outputs.window",
    "body_composition_records.by_customers",
    "coaching_coach_actions.recent_by_enrollments",
  );

  if (customersResult.error) {
    throw new CoachingServiceError(customersResult.error.message, 500);
  }
  if (logsResult.error) {
    throw new CoachingServiceError(logsResult.error.message, 500);
  }
  if (bodyResult.error) {
    throw new CoachingServiceError(bodyResult.error.message, 500);
  }

  const customerById = new Map(
    (customersResult.data ?? []).map((row) => [
      String(row.id),
      {
        displayName: String(row.display_name ?? "顧客"),
        phone: row.phone != null ? String(row.phone) : null,
      },
    ]),
  );

  const logsByEnrollment = new Map<string, CoachingDailyLogDetail[]>();
  for (const row of logsResult.data ?? []) {
    const mapped = mapDailyLogLight(row as Record<string, unknown>);
    const list = logsByEnrollment.get(mapped.enrollmentId) ?? [];
    list.push(mapped);
    logsByEnrollment.set(mapped.enrollmentId, list);
  }

  let aiRows: CoachingAiOutputRecord[] = [];
  if (aiResult.error) {
    audit.queries[audit.queries.indexOf("coaching_ai_outputs.window")] =
      "coaching_ai_outputs.window_failed_soft";
  } else {
    aiRows = (aiResult.data ?? []).map((row) => mapCoachingAiOutputRow(row as Record<string, unknown>));
  }
  const latestAiByEnrollment = pickLatestCompletedAiByEnrollment(aiRows);
  const todayAiByEnrollment = new Map<string, CoachingAiOutputRecord>();
  for (const row of aiRows) {
    if (row.logDate !== input.asOfLogDate) continue;
    const existing = todayAiByEnrollment.get(row.enrollmentId);
    if (!existing) {
      todayAiByEnrollment.set(row.enrollmentId, row);
      continue;
    }
    // Prefer completed > processing > pending > failed
    const rank = (status: string) =>
      status === "completed" ? 4 : status === "processing" ? 3 : status === "pending" ? 2 : 1;
    if (rank(row.status) > rank(existing.status)) {
      todayAiByEnrollment.set(row.enrollmentId, row);
    }
  }

  const bodyByCustomer = new Map<string, BodyCompositionRecord[]>();
  for (const row of bodyResult.data ?? []) {
    const mapped = mapBodyRecordRow(row as Record<string, unknown>);
    const list = bodyByCustomer.get(mapped.customerId) ?? [];
    list.push(mapped);
    bodyByCustomer.set(mapped.customerId, list);
  }

  const batchCustomers: CommandCenterBatchCustomer[] = enrollments.map((enrollment) => {
    const identity = customerById.get(enrollment.customerId);
    return {
      enrollment,
      displayName: identity?.displayName ?? "顧客",
      phone: identity?.phone ?? null,
      logs: logsByEnrollment.get(enrollment.id) ?? [],
      bodyRecords: bodyByCustomer.get(enrollment.customerId) ?? [],
      latestAiOutput: latestAiByEnrollment.get(enrollment.id) ?? null,
      todayAiOutput: todayAiByEnrollment.get(enrollment.id) ?? null,
      recentCoachActions: (actionsByEnrollment.get(enrollment.id) ?? []).map(mapCoachActionToAttentionShape),
    };
  });

  const result = assembleCommandCenter({
    ownerMemberId: input.ownerMemberId,
    asOfLogDate: input.asOfLogDate,
    asOfHourTaipei: input.asOfHourTaipei,
    customers: batchCustomers,
  });

  return { result, audit };
}
