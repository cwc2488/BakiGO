import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type { EntityId } from "@/types";
import type {
  CoachingDailyLog,
  CoachingDailyLogDetail,
  CoachingEnrollment,
  CoachingMealEntryWithPhoto,
  CoachingMealPhoto,
  CoachingMealSlot,
  CoachingPortalContext,
} from "@/types/coaching";
import { cloneDefaultCoachingPlanSnapshot, parseCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import { computeSleepDurationLabel, normalizeClockTimeInput } from "@/lib/coaching/coaching-sleep";
import {
  defaultPlannedEndDate,
  resolveEnrollmentStartDate,
} from "@/lib/coaching/enrollment-window";

export class CoachingServiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "CoachingServiceError";
  }
}

export type ResolvedCoachingPortal = {
  customerId: EntityId;
  enrollmentId: EntityId;
  ownerMemberId: EntityId;
  displayName: string;
};

type EnrollmentRow = {
  id: string;
  customer_id: string;
  owner_member_id: string;
  goal: string | null;
  status: string;
  started_at: string;
  planned_end_at?: string | null;
  ended_at: string | null;
  onboarding_completed_at: string | null;
  plan_snapshot_json: unknown;
  baseline_body_record_id: string | null;
  created_at: string;
  updated_at: string;
};

type DailyLogRow = {
  id: string;
  enrollment_id: string;
  customer_id: string;
  owner_member_id: string;
  log_date: string;
  water_ml: number | null;
  exercise_note: string | null;
  bowel_movement_count: number | null;
  sleep_duration: string | null;
  sleep_bedtime: string | null;
  sleep_wake_time: string | null;
  customer_note: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

type MealEntryRow = {
  id: string;
  daily_log_id: string;
  meal_slot: string;
  text_note: string | null;
  eaten_at: string | null;
  created_at: string;
  updated_at: string;
  coaching_meal_photos?: Array<{
    id: string;
    meal_entry_id: string;
    storage_path: string;
    uploaded_at: string;
    created_at: string;
  }> | null;
};

function mapEnrollment(row: EnrollmentRow): CoachingEnrollment {
  return {
    id: row.id,
    customerId: row.customer_id,
    ownerMemberId: row.owner_member_id,
    goal: row.goal,
    status: row.status as CoachingEnrollment["status"],
    startedAt: row.started_at,
    plannedEndAt: row.planned_end_at != null ? String(row.planned_end_at).slice(0, 10) : null,
    endedAt: row.ended_at,
    onboardingCompletedAt: row.onboarding_completed_at,
    planSnapshot: parseCoachingPlanSnapshot(row.plan_snapshot_json),
    baselineBodyRecordId: row.baseline_body_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClockTimeFromDb(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return normalizeClockTimeInput(value);
}

function mapDailyLog(row: DailyLogRow): CoachingDailyLog {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    customerId: row.customer_id,
    ownerMemberId: row.owner_member_id,
    logDate: row.log_date,
    waterMl: row.water_ml,
    exerciseNote: row.exercise_note,
    bowelMovementCount: row.bowel_movement_count,
    sleepDuration: row.sleep_duration,
    sleepBedtime: mapClockTimeFromDb(row.sleep_bedtime),
    sleepWakeTime: mapClockTimeFromDb(row.sleep_wake_time),
    customerNote: row.customer_note,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMealPhoto(row: {
  id: string;
  meal_entry_id: string;
  storage_path: string;
  uploaded_at: string;
  created_at: string;
}): CoachingMealPhoto {
  return {
    id: row.id,
    mealEntryId: row.meal_entry_id,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
  };
}

function mapMealEntry(row: MealEntryRow): CoachingMealEntryWithPhoto {
  const photoRow = row.coaching_meal_photos?.[0] ?? null;
  return {
    id: row.id,
    dailyLogId: row.daily_log_id,
    mealSlot: row.meal_slot as CoachingMealEntryWithPhoto["mealSlot"],
    textNote: row.text_note,
    eatenAt: row.eaten_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photo: photoRow ? mapMealPhoto(photoRow) : null,
  };
}

export async function resolveCoachingPortalContext(token: string): Promise<CoachingPortalContext | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("resolve_coaching_portal_context", {
    portal_token: token,
  });

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
  if (!data) {
    return null;
  }

  const payload = data as CoachingPortalContext & { planSnapshot?: unknown };
  return {
    ...payload,
    planSnapshot: payload.planSnapshot ? parseCoachingPlanSnapshot(payload.planSnapshot) : undefined,
  };
}

export async function resolveActiveCoachingPortal(token: string): Promise<ResolvedCoachingPortal> {
  const context = await resolveCoachingPortalContext(token);
  if (!context?.validToken) {
    throw new CoachingServiceError("連結無效或已過期", 404);
  }
  if (!context.hasActiveEnrollment || !context.enrollmentId || !context.customerId) {
    throw new CoachingServiceError("目前沒有進行中的陪跑", 404);
  }

  const supabase = createSupabaseServiceClient();
  const { data: enrollment, error } = await supabase
    .from("coaching_enrollments")
    .select("owner_member_id")
    .eq("id", context.enrollmentId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
  if (!enrollment) {
    throw new CoachingServiceError("目前沒有進行中的陪跑", 404);
  }

  return {
    customerId: context.customerId,
    enrollmentId: context.enrollmentId,
    ownerMemberId: String(enrollment.owner_member_id),
    displayName: context.displayName ?? "顧客",
  };
}

async function assertCustomerOwnedByMember(customerId: string, ownerMemberId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("owner_member_id", ownerMemberId)
    .maybeSingle();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
  if (!data) {
    throw new CoachingServiceError("Forbidden", 403);
  }
}

async function getLatestBodyRecordId(customerId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("body_composition_records")
    .select("id")
    .eq("customer_id", customerId)
    .order("record_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
  return data?.id ? String(data.id) : null;
}

export async function createCoachingEnrollment(input: {
  customerId: string;
  ownerMemberId: string;
  goal?: string | null;
  planSnapshot?: CoachingEnrollment["planSnapshot"];
  /** Journey Day 1 (YYYY-MM-DD). Defaults to today Taipei when omitted. */
  startDate?: string | null;
  /** Inclusive planned end (YYYY-MM-DD). Defaults to start + 89 days. */
  plannedEndAt?: string | null;
}): Promise<CoachingEnrollment> {
  await assertCustomerOwnedByMember(input.customerId, input.ownerMemberId);

  const supabase = createSupabaseServiceClient();

  const { data: existingActive, error: existingError } = await supabase
    .from("coaching_enrollments")
    .select("id")
    .eq("customer_id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId)
    .eq("status", "active")
    .maybeSingle();

  if (existingError) {
    throw new CoachingServiceError(existingError.message, 500);
  }
  if (existingActive) {
    throw new CoachingServiceError("此顧客已有進行中的陪跑", 409);
  }

  const baselineBodyRecordId = await getLatestBodyRecordId(input.customerId);

  const startDate =
    input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate)
      ? input.startDate
      : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const plannedEndAt =
    input.plannedEndAt && /^\d{4}-\d{2}-\d{2}$/.test(input.plannedEndAt)
      ? input.plannedEndAt
      : defaultPlannedEndDate(startDate);
  if (plannedEndAt < startDate) {
    throw new CoachingServiceError("結束日不得早於開始日", 400);
  }

  const { data, error } = await supabase
    .from("coaching_enrollments")
    .insert({
      customer_id: input.customerId,
      owner_member_id: input.ownerMemberId,
      goal: input.goal?.trim() || null,
      status: "active",
      started_at: `${startDate}T00:00:00+08:00`,
      planned_end_at: plannedEndAt,
      plan_snapshot_json: input.planSnapshot ?? cloneDefaultCoachingPlanSnapshot(),
      baseline_body_record_id: baselineBodyRecordId,
    })
    .select("*")
    .single();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }

  return mapEnrollment(data as EnrollmentRow);
}

export async function updateCoachingEnrollment(input: {
  enrollmentId: string;
  ownerMemberId: string;
  status?: CoachingEnrollment["status"];
  goal?: string | null;
  planSnapshot?: CoachingEnrollment["planSnapshot"];
  startDate?: string | null;
  plannedEndAt?: string | null;
}): Promise<CoachingEnrollment> {
  const supabase = createSupabaseServiceClient();

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.status) {
    patch.status = input.status;
    if (input.status === "completed") {
      patch.ended_at = new Date().toISOString();
    }
    if (input.status === "active") {
      patch.ended_at = null;
    }
  }
  if (input.goal !== undefined) {
    patch.goal = input.goal?.trim() || null;
  }
  if (input.planSnapshot) {
    patch.plan_snapshot_json = input.planSnapshot;
  }
  if (input.startDate !== undefined && input.startDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
      throw new CoachingServiceError("開始日格式錯誤", 400);
    }
    patch.started_at = `${input.startDate}T00:00:00+08:00`;
  }
  if (input.plannedEndAt !== undefined) {
    if (input.plannedEndAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.plannedEndAt)) {
      throw new CoachingServiceError("結束日格式錯誤", 400);
    }
    patch.planned_end_at = input.plannedEndAt;
  }

  const nextStart =
    typeof patch.started_at === "string"
      ? resolveEnrollmentStartDate(String(patch.started_at))
      : null;
  const nextEnd =
    typeof patch.planned_end_at === "string" ? String(patch.planned_end_at).slice(0, 10) : null;
  if (nextStart && nextEnd && nextEnd < nextStart) {
    throw new CoachingServiceError("結束日不得早於開始日", 400);
  }

  const { data, error } = await supabase
    .from("coaching_enrollments")
    .update(patch)
    .eq("id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .select("*")
    .single();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
  if (!data) {
    throw new CoachingServiceError("Forbidden", 403);
  }

  const enrollment = mapEnrollment(data as EnrollmentRow);

  // Event: enrollment lifecycle → Growth reconcile (best-effort)
  if (input.status) {
    void import("@/lib/coaching/growth/trigger-growth-reconcile").then(({ triggerGrowthReconcileBestEffort }) =>
      triggerGrowthReconcileBestEffort({
        enrollmentId: input.enrollmentId,
        ownerMemberId: input.ownerMemberId,
      }),
    );
  }

  return enrollment;
}

export async function getCoachingEnrollmentForCoach(input: {
  enrollmentId: string;
  ownerMemberId: string;
}): Promise<CoachingEnrollment> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_enrollments")
    .select("*")
    .eq("id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .maybeSingle();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
  if (!data) {
    throw new CoachingServiceError("Forbidden", 403);
  }

  return mapEnrollment(data as EnrollmentRow);
}

export async function getActiveEnrollmentForCustomer(input: {
  customerId: string;
  ownerMemberId: string;
}): Promise<CoachingEnrollment | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_enrollments")
    .select("*")
    .eq("customer_id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
  return data ? mapEnrollment(data as EnrollmentRow) : null;
}

export async function listActiveCoachingEnrollments(ownerMemberId: string): Promise<CoachingEnrollment[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_enrollments")
    .select("*")
    .eq("owner_member_id", ownerMemberId)
    .eq("status", "active")
    .order("started_at", { ascending: false });

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }

  return (data ?? []).map((row) => mapEnrollment(row as EnrollmentRow));
}

export async function completeCoachingOnboarding(enrollmentId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("coaching_enrollments")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId)
    .eq("status", "active");

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }
}

async function ensureDailyLog(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
}): Promise<DailyLogRow> {
  const supabase = createSupabaseServiceClient();

  const { data: existing, error: existingError } = await supabase
    .from("coaching_daily_logs")
    .select("*")
    .eq("enrollment_id", input.enrollmentId)
    .eq("log_date", input.logDate)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) {
    throw new CoachingServiceError(existingError.message, 500);
  }
  if (existing) {
    return existing as DailyLogRow;
  }

  const { data, error } = await supabase
    .from("coaching_daily_logs")
    .insert({
      enrollment_id: input.enrollmentId,
      customer_id: input.customerId,
      owner_member_id: input.ownerMemberId,
      log_date: input.logDate,
    })
    .select("*")
    .single();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }

  return data as DailyLogRow;
}

async function ensureMealEntry(dailyLogId: string, mealSlot: CoachingMealSlot): Promise<MealEntryRow> {
  const supabase = createSupabaseServiceClient();

  const { data: existing, error: existingError } = await supabase
    .from("coaching_meal_entries")
    .select("*")
    .eq("daily_log_id", dailyLogId)
    .eq("meal_slot", mealSlot)
    .maybeSingle();

  if (existingError) {
    throw new CoachingServiceError(existingError.message, 500);
  }
  if (existing) {
    return existing as MealEntryRow;
  }

  const { data, error } = await supabase
    .from("coaching_meal_entries")
    .insert({
      daily_log_id: dailyLogId,
      meal_slot: mealSlot,
    })
    .select("*")
    .single();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }

  return data as MealEntryRow;
}

export async function upsertCoachingDailyLog(input: {
  portal: ResolvedCoachingPortal;
  logDate: string;
  waterMl?: number | null;
  exerciseNote?: string | null;
  bowelMovementCount?: number | null;
  sleepBedtime?: string | null;
  sleepWakeTime?: string | null;
  customerNote?: string | null;
  meals?: Partial<Record<CoachingMealSlot, { textNote?: string | null; eatenAt?: string | null }>>;
  markSubmitted?: boolean;
}): Promise<CoachingDailyLogDetail> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    enrollment_id: input.portal.enrollmentId,
    customer_id: input.portal.customerId,
    owner_member_id: input.portal.ownerMemberId,
    log_date: input.logDate,
    updated_at: now,
  };

  if (input.waterMl !== undefined) patch.water_ml = input.waterMl;
  if (input.exerciseNote !== undefined) patch.exercise_note = input.exerciseNote?.trim() || null;
  if (input.bowelMovementCount !== undefined) patch.bowel_movement_count = input.bowelMovementCount;

  if (input.sleepBedtime !== undefined || input.sleepWakeTime !== undefined) {
    const bedtime =
      input.sleepBedtime !== undefined ? normalizeClockTimeInput(input.sleepBedtime) : undefined;
    const wakeTime =
      input.sleepWakeTime !== undefined ? normalizeClockTimeInput(input.sleepWakeTime) : undefined;

    if (input.sleepBedtime !== undefined) {
      patch.sleep_bedtime = bedtime;
    }
    if (input.sleepWakeTime !== undefined) {
      patch.sleep_wake_time = wakeTime;
    }

    const resolvedBedtime = input.sleepBedtime !== undefined ? bedtime : undefined;
    const resolvedWake = input.sleepWakeTime !== undefined ? wakeTime : undefined;

    if (resolvedBedtime !== undefined && resolvedWake !== undefined) {
      patch.sleep_duration =
        resolvedBedtime && resolvedWake ? computeSleepDurationLabel(resolvedBedtime, resolvedWake) : null;
    }
  }

  if (input.customerNote !== undefined) patch.customer_note = input.customerNote?.trim() || null;
  if (input.markSubmitted) patch.submitted_at = now;

  const { data: existingLog, error: existingLogError } = await supabase
    .from("coaching_daily_logs")
    .select("id")
    .eq("enrollment_id", input.portal.enrollmentId)
    .eq("log_date", input.logDate)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingLogError) {
    throw new CoachingServiceError(existingLogError.message, 500);
  }

  let dailyLogRow: { id: string } | null = existingLog as { id: string } | null;
  if (dailyLogRow) {
    const { data: updated, error: updateError } = await supabase
      .from("coaching_daily_logs")
      .update(patch)
      .eq("id", dailyLogRow.id)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (updateError || !updated) {
      throw new CoachingServiceError(updateError?.message || "Failed to save daily log.", 500);
    }
    dailyLogRow = updated as { id: string };
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("coaching_daily_logs")
      .insert(patch)
      .select("id")
      .single();
    if (insertError || !inserted) {
      throw new CoachingServiceError(insertError?.message || "Failed to save daily log.", 500);
    }
    dailyLogRow = inserted as { id: string };
  }

  if (!dailyLogRow) {
    throw new CoachingServiceError("Failed to save daily log.", 500);
  }

  if (input.meals) {
    const mealWrites = Object.entries(input.meals).flatMap(([mealSlot, mealPatch]) => {
      if (!mealPatch) return [];
      const row: Record<string, unknown> = {
        daily_log_id: dailyLogRow.id,
        meal_slot: mealSlot,
        updated_at: now,
      };
      if (mealPatch.textNote !== undefined) {
        row.text_note = mealPatch.textNote?.trim() || null;
      }
      if (mealPatch.eatenAt !== undefined) {
        row.eaten_at = mealPatch.eatenAt;
      }
      return [
        supabase
          .from("coaching_meal_entries")
          .upsert(row, { onConflict: "daily_log_id,meal_slot" })
          .select("id")
          .single()
          .then(({ error }) => {
            if (error) {
              throw new CoachingServiceError(error.message, 500);
            }
          }),
      ];
    });
    await Promise.all(mealWrites);
  }

  return getCoachingDailyLogDetail({
    enrollmentId: input.portal.enrollmentId,
    logDate: input.logDate,
    ownerMemberId: input.portal.ownerMemberId,
  });
}

export async function getCoachingDailyLogDetail(input: {
  enrollmentId: string;
  logDate: string;
  ownerMemberId?: string;
}): Promise<CoachingDailyLogDetail> {
  const supabase = createSupabaseServiceClient();

  let query = supabase
    .from("coaching_daily_logs")
    .select(`
      *,
      coaching_meal_entries (
        *,
        coaching_meal_photos (*)
      )
    `)
    .eq("enrollment_id", input.enrollmentId)
    .eq("log_date", input.logDate);

  if (input.ownerMemberId) {
    query = query.eq("owner_member_id", input.ownerMemberId);
  }

  const { data, error } = await query.is("deleted_at", null).maybeSingle();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }

  if (!data) {
    return {
      id: "",
      enrollmentId: input.enrollmentId,
      customerId: "",
      ownerMemberId: input.ownerMemberId ?? "",
      logDate: input.logDate,
      waterMl: null,
      exerciseNote: null,
      bowelMovementCount: null,
      sleepDuration: null,
      sleepBedtime: null,
      sleepWakeTime: null,
      customerNote: null,
      submittedAt: null,
      createdAt: "",
      updatedAt: "",
      meals: [],
    };
  }

  const row = data as DailyLogRow & { coaching_meal_entries?: MealEntryRow[] | null };
  return {
    ...mapDailyLog(row),
    meals: (row.coaching_meal_entries ?? []).map(mapMealEntry),
  };
}

export async function attachMealPhoto(input: {
  portal: ResolvedCoachingPortal;
  logDate: string;
  mealSlot: CoachingMealSlot;
  storagePath: string;
}): Promise<CoachingMealEntryWithPhoto> {
  const dailyLogRow = await ensureDailyLog({
    enrollmentId: input.portal.enrollmentId,
    customerId: input.portal.customerId,
    ownerMemberId: input.portal.ownerMemberId,
    logDate: input.logDate,
  });
  const mealEntry = await ensureMealEntry(dailyLogRow.id, input.mealSlot);

  const supabase = createSupabaseServiceClient();

  const { data: existingPhotos, error: existingError } = await supabase
    .from("coaching_meal_photos")
    .select("id, storage_path")
    .eq("meal_entry_id", mealEntry.id);

  if (existingError) {
    throw new CoachingServiceError(existingError.message, 500);
  }

  for (const photo of existingPhotos ?? []) {
    await supabase.storage.from("coaching-meal-photos").remove([photo.storage_path]);
    await supabase.from("coaching_meal_photos").delete().eq("id", photo.id);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("coaching_meal_photos")
    .insert({
      meal_entry_id: mealEntry.id,
      storage_path: input.storagePath,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new CoachingServiceError(insertError.message, 500);
  }

  return {
    id: mealEntry.id,
    dailyLogId: mealEntry.daily_log_id,
    mealSlot: mealEntry.meal_slot as CoachingMealSlot,
    textNote: mealEntry.text_note,
    eatenAt: mealEntry.eaten_at,
    createdAt: mealEntry.created_at,
    updatedAt: mealEntry.updated_at,
    photo: mapMealPhoto(inserted),
  };
}

export async function createSignedCoachingPhotoUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from("coaching-meal-photos")
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new CoachingServiceError(error?.message ?? "無法產生照片連結", 500);
  }

  return data.signedUrl;
}

export async function assertCoachOwnsMealPhoto(ownerMemberId: string, storagePath: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_meal_photos")
    .select(`
      id,
      coaching_meal_entries!inner (
        coaching_daily_logs!inner (
          owner_member_id
        )
      )
    `)
    .eq("storage_path", storagePath)
    .maybeSingle();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }

  const ownerId = (data as { coaching_meal_entries?: { coaching_daily_logs?: { owner_member_id?: string } } } | null)
    ?.coaching_meal_entries?.coaching_daily_logs?.owner_member_id;

  if (!ownerId || ownerId !== ownerMemberId) {
    throw new CoachingServiceError("Forbidden", 403);
  }
}

export function buildCoachingMealPhotoPath(input: {
  customerId: string;
  enrollmentId: string;
  logDate: string;
  mealSlot: CoachingMealSlot;
  photoId: string;
}): string {
  return `${input.customerId}/${input.enrollmentId}/${input.logDate}/${input.mealSlot}/${input.photoId}.jpg`;
}

export async function listCoachingDailyLogsForEnrollment(input: {
  enrollmentId: string;
  ownerMemberId: string;
  limit?: number;
}): Promise<CoachingDailyLogDetail[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_daily_logs")
    .select(`
      *,
      coaching_meal_entries (
        *,
        coaching_meal_photos (*)
      )
    `)
    .eq("enrollment_id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .is("deleted_at", null)
    .order("log_date", { ascending: false })
    .limit(input.limit ?? 30);

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }

  return (data ?? []).map((row) => {
    const typed = row as DailyLogRow & { coaching_meal_entries?: MealEntryRow[] | null };
    return {
      ...mapDailyLog(typed),
      meals: (typed.coaching_meal_entries ?? []).map(mapMealEntry),
    };
  });
}

export async function getCoachingDashboardRows(ownerMemberId: string, logDate: string) {
  const enrollments = await listActiveCoachingEnrollments(ownerMemberId);
  const supabase = createSupabaseServiceClient();

  const customerIds = enrollments.map((enrollment) => enrollment.customerId);
  const { data: customers, error: customersError } = customerIds.length
    ? await supabase.from("customers").select("id, display_name").in("id", customerIds)
    : { data: [], error: null };

  if (customersError) {
    throw new CoachingServiceError(customersError.message, 500);
  }

  const customerNameById = new Map((customers ?? []).map((row) => [String(row.id), String(row.display_name)]));

  const { listCoachingAiOutputsForOwnerDay } = await import("@/lib/coaching/ai/coaching-ai-store");
  let aiByEnrollment = new Map<string, Awaited<ReturnType<typeof listCoachingAiOutputsForOwnerDay>>[number]>();
  try {
    const aiOutputs = await listCoachingAiOutputsForOwnerDay({
      ownerMemberId,
      logDate,
      enrollmentIds: enrollments.map((enrollment) => enrollment.id),
    });
    aiByEnrollment = new Map(aiOutputs.map((output) => [output.enrollmentId, output]));
  } catch {
    // AI tables may be unavailable during rollout — dashboard still works without briefs.
    aiByEnrollment = new Map();
  }

  const rows = await Promise.all(
    enrollments.map(async (enrollment) => {
      const detail = await getCoachingDailyLogDetail({
        enrollmentId: enrollment.id,
        logDate,
        ownerMemberId,
      });

      const { buildCoachingTodayStatus } = await import("@/lib/coaching/coaching-completion");
      const status = buildCoachingTodayStatus({
        enrollmentId: enrollment.id,
        customerId: enrollment.customerId,
        customerDisplayName: customerNameById.get(enrollment.customerId) ?? "顧客",
        goal: enrollment.goal,
        logDate,
        log: detail.id ? detail : null,
        meals: detail.meals,
      });

      const ai = aiByEnrollment.get(enrollment.id);
      if (!ai) {
        return { ...status, aiBrief: { status: "missing" as const, dailySummary: null, finalInterventionLevel: null, coachAttentionRequired: false } };
      }

      return {
        ...status,
        aiBrief: {
          status: ai.status,
          dailySummary: ai.status === "completed" && ai.outputJson ? ai.outputJson.coach.daily_summary : null,
          finalInterventionLevel: ai.finalInterventionLevel,
          // Deterministic coach attention only — never AI proposed level.
          coachAttentionRequired: Boolean(
            ai.status === "completed" && ai.outputJson?.coach.coach_attention_required,
          ),
        },
      };
    }),
  );

  return rows;
}

export function serializeCoachingEnrollment(enrollment: CoachingEnrollment) {
  return {
    id: enrollment.id,
    customerId: enrollment.customerId,
    ownerMemberId: enrollment.ownerMemberId,
    goal: enrollment.goal,
    status: enrollment.status,
    startedAt: enrollment.startedAt,
    plannedEndAt: enrollment.plannedEndAt ?? null,
    endedAt: enrollment.endedAt,
    onboardingCompletedAt: enrollment.onboardingCompletedAt,
    planSnapshot: enrollment.planSnapshot,
    baselineBodyRecordId: enrollment.baselineBodyRecordId,
    createdAt: enrollment.createdAt,
    updatedAt: enrollment.updatedAt,
  };
}

export function serializeCoachingDailyLogDetail(detail: CoachingDailyLogDetail) {
  return {
    ...detail,
    meals: detail.meals.map((meal) => ({
      ...meal,
      photo: meal.photo
        ? {
            ...meal.photo,
            signedUrl: null as string | null,
          }
        : null,
    })),
  };
}
