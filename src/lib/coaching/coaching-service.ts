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

  const { data, error } = await supabase
    .from("coaching_enrollments")
    .insert({
      customer_id: input.customerId,
      owner_member_id: input.ownerMemberId,
      goal: input.goal?.trim() || null,
      status: "active",
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

  return mapEnrollment(data as EnrollmentRow);
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
  const dailyLogRow = await ensureDailyLog({
    enrollmentId: input.portal.enrollmentId,
    customerId: input.portal.customerId,
    ownerMemberId: input.portal.ownerMemberId,
    logDate: input.logDate,
  });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
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
  if (input.markSubmitted) patch.submitted_at = new Date().toISOString();

  const supabase = createSupabaseServiceClient();
  const { error: updateError } = await supabase
    .from("coaching_daily_logs")
    .update(patch)
    .eq("id", dailyLogRow.id);

  if (updateError) {
    throw new CoachingServiceError(updateError.message, 500);
  }

  if (input.meals) {
    for (const [mealSlot, mealPatch] of Object.entries(input.meals)) {
      if (!mealPatch) continue;
      const mealEntry = await ensureMealEntry(dailyLogRow.id, mealSlot as CoachingMealSlot);
      const mealUpdate: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (mealPatch.textNote !== undefined) {
        mealUpdate.text_note = mealPatch.textNote?.trim() || null;
      }
      if (mealPatch.eatenAt !== undefined) {
        mealUpdate.eaten_at = mealPatch.eatenAt;
      }
      const { error } = await supabase
        .from("coaching_meal_entries")
        .update(mealUpdate)
        .eq("id", mealEntry.id);
      if (error) {
        throw new CoachingServiceError(error.message, 500);
      }
    }
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

  const { data, error } = await query.maybeSingle();

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

  const rows = await Promise.all(
    enrollments.map(async (enrollment) => {
      const detail = await getCoachingDailyLogDetail({
        enrollmentId: enrollment.id,
        logDate,
        ownerMemberId,
      });

      const { buildCoachingTodayStatus } = await import("@/lib/coaching/coaching-completion");

      return buildCoachingTodayStatus({
        enrollmentId: enrollment.id,
        customerId: enrollment.customerId,
        customerDisplayName: customerNameById.get(enrollment.customerId) ?? "顧客",
        goal: enrollment.goal,
        logDate,
        log: detail.id ? detail : null,
        meals: detail.meals,
      });
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
