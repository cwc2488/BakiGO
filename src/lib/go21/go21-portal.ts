import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  CoachingServiceError,
  resolveActiveCoachingPortal,
  type ResolvedCoachingPortal,
} from "@/lib/coaching/coaching-service";
import { isExperience21dEnrollment, experience21dFromPlanSnapshot } from "@/lib/coaching/experience-21d";
import { coachingJourneyDayNumberInWindow, addCalendarDays } from "@/lib/coaching/enrollment-window";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import {
  GO21_BRAND_NAME,
  GO21_BRAND_SUBTITLE,
  GO21_CYCLE_DAYS,
  type Go21ProgressMilestone,
} from "@/types/go21";
import { getSharedInMemoryV2Store } from "@/lib/coaching/ai/v2/memory-store";
import { buildLifecycleSnapshot } from "@/lib/coaching/ai/v2/lifecycle";
import { deliverDueGo21RemindersForEnrollment } from "@/lib/go21/reminders";

export type Go21PortalBundle = {
  brandName: typeof GO21_BRAND_NAME;
  brandSubtitle: typeof GO21_BRAND_SUBTITLE;
  portal: ResolvedCoachingPortal;
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  isGo21: boolean;
  go21StartedAt: string | null;
  /** Authoritative Day-1 calendar date for customer Day X / checkpoints. */
  lifecycleAnchorDate: string;
  dayNumber: number | null;
  dayTotal: number;
  lifecycleStage: string;
  enrollmentStatus: string;
  milestones: Go21ProgressMilestone[];
  customerProfile: {
    displayName: string;
    sex: string | null;
    birthDate: string | null;
    birthYear: number | null;
    heightCm: number | null;
  };
  latestBody: {
    recordDate: string;
    weightKg: number | null;
    bodyFatPercent: number | null;
    skeletalMuscleKg: number | null;
    visceralFatLevel: number | null;
    basalMetabolicRate: number | null;
  } | null;
  needsBaseline: boolean;
};

type EnrollmentRow = {
  id: string;
  goal: string | null;
  status: string;
  started_at: string;
  planned_end_at: string | null;
  plan_snapshot_json: unknown;
  onboarding_completed_at: string | null;
  go21_started_at?: string | null;
  customer_id: string;
  owner_member_id: string;
};

/**
 * Resolve portal and enforce Go21 eligibility (experience 21d enrollment).
 * Generic coaching portals cannot silently become Baki Go 21.
 */
export async function requireGo21Portal(token: string): Promise<{
  portal: ResolvedCoachingPortal;
  enrollment: EnrollmentRow;
  isGo21: true;
}> {
  const portal = await resolveActiveCoachingPortal(token);
  const enrollment = await loadEnrollment(portal.enrollmentId);
  if (!enrollment) {
    throw new CoachingServiceError("Enrollment not found", 404);
  }
  if (enrollment.customer_id !== portal.customerId || enrollment.owner_member_id !== portal.ownerMemberId) {
    throw new CoachingServiceError("Portal enrollment mismatch", 403);
  }
  if (!isGo21Enrollment(enrollment)) {
    throw new CoachingServiceError("此連結不是 Baki Go 21 體驗，請請教練開通 21 天 AI 陪跑。", 403);
  }
  return { portal, enrollment, isGo21: true };
}

export function isGo21Enrollment(enrollment: {
  plan_snapshot_json?: unknown;
}): boolean {
  const planSnapshot =
    enrollment.plan_snapshot_json && typeof enrollment.plan_snapshot_json === "object"
      ? (enrollment.plan_snapshot_json as {
          experience21d?: { productReceivedDate: string; interestId?: string };
        })
      : {};
  const enrollmentLike = { planSnapshot };
  return (
    isExperience21dEnrollment(enrollmentLike as never) ||
    Boolean(experience21dFromPlanSnapshot(planSnapshot as never))
  );
}

/**
 * Authoritative customer Day-1 date:
 * Prefer enrollment.started_at (experience schedule Day 1).
 * go21_started_at only gates chat UX — does not shift Day X after activation.
 */
export function resolveGo21LifecycleAnchor(enrollment: {
  started_at: string;
  go21_started_at?: string | null;
}): string {
  return String(enrollment.started_at).slice(0, 10);
}

export async function loadGo21PortalBundle(token: string): Promise<Go21PortalBundle> {
  const { portal, enrollment } = await requireGo21Portal(token);
  const supabase = createSupabaseServiceClient();
  const today = coachingTodayLogDate();
  const lifecycleAnchorDate = resolveGo21LifecycleAnchor(enrollment);

  const dayNumber = coachingJourneyDayNumberInWindow({
    startedAt: lifecycleAnchorDate,
    plannedEndAt: enrollment.planned_end_at,
    logDate: today,
  });

  const { data: customer } = await supabase
    .from("customers")
    .select("display_name, sex, birth_date, birth_year, height_cm")
    .eq("id", portal.customerId)
    .eq("owner_member_id", portal.ownerMemberId)
    .maybeSingle();

  const { data: bodyRows } = await supabase
    .from("body_composition_records")
    .select(
      "record_date, weight_kg, body_fat_percent, skeletal_muscle_kg, visceral_fat_level, basal_metabolic_rate",
    )
    .eq("customer_id", portal.customerId)
    .gte("record_date", lifecycleAnchorDate)
    .order("record_date", { ascending: false })
    .limit(10);

  // Prefill baseline may use any latest including pre-cycle for needsBaseline only
  const { data: anyBody } = await supabase
    .from("body_composition_records")
    .select(
      "record_date, weight_kg, body_fat_percent, skeletal_muscle_kg, visceral_fat_level, basal_metabolic_rate",
    )
    .eq("customer_id", portal.customerId)
    .order("record_date", { ascending: false })
    .limit(1);

  const latest = anyBody?.[0] ?? null;
  const sex = customer?.sex ? String(customer.sex) : null;
  const heightCm = customer?.height_cm != null ? Number(customer.height_cm) : null;
  const hasWeight = latest?.weight_kg != null;
  const needsBaseline = !sex || heightCm == null || !hasWeight;

  const go21Raw =
    "go21_started_at" in enrollment ? enrollment.go21_started_at : null;
  const go21StartedAt = go21Raw ? String(go21Raw) : null;

  const measurementDates = new Set(
    (bodyRows ?? []).map((r) => String(r.record_date).slice(0, 10)),
  );

  const milestones: Go21ProgressMilestone[] = [
    {
      day: 1,
      label: "開始",
      kind: "start",
      optional: false,
      reached: (dayNumber ?? 0) >= 1,
      completed: Boolean(go21StartedAt),
    },
    {
      day: 7,
      label: "量測",
      kind: "measurement",
      optional: true,
      reached: (dayNumber ?? 0) >= 7,
      completed: hasMeasurementNearDay(lifecycleAnchorDate, 7, measurementDates),
    },
    {
      day: 14,
      label: "量測",
      kind: "measurement",
      optional: true,
      reached: (dayNumber ?? 0) >= 14,
      completed: hasMeasurementNearDay(lifecycleAnchorDate, 14, measurementDates),
    },
    {
      day: 21,
      label: "最終量測 / 21天回顧",
      kind: "review",
      optional: true,
      reached: (dayNumber ?? 0) >= 21,
      completed: hasMeasurementNearDay(lifecycleAnchorDate, 21, measurementDates),
    },
  ];

  let lifecycleStage = "understand";
  try {
    const store = getSharedInMemoryV2Store();
    const cycle = await store.getActiveCycle(portal.enrollmentId);
    lifecycleStage = buildLifecycleSnapshot({ cycle, logDate: today }).stage;
  } catch {
    if (dayNumber != null) {
      if (dayNumber <= 3) lifecycleStage = "understand";
      else if (dayNumber <= 7) lifecycleStage = "find_patterns";
      else if (dayNumber <= 14) lifecycleStage = "experiment";
      else if (dayNumber <= 20) lifecycleStage = "build_autonomy";
      else lifecycleStage = "day21_ending";
    }
  }

  // Deliver due in-app reminders when customer opens the app (completes delivery loop)
  try {
    await deliverDueGo21RemindersForEnrollment({
      enrollmentId: portal.enrollmentId,
      customerId: portal.customerId,
      ownerMemberId: portal.ownerMemberId,
      lifecycleDay: dayNumber,
      lifecycleAnchorDate,
      cycleStatus: enrollment.status,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "go21_on_open_reminder_delivery_failed",
        enrollmentId: portal.enrollmentId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  return {
    brandName: GO21_BRAND_NAME,
    brandSubtitle: GO21_BRAND_SUBTITLE,
    portal,
    enrollmentId: portal.enrollmentId,
    customerId: portal.customerId,
    ownerMemberId: portal.ownerMemberId,
    isGo21: true,
    go21StartedAt,
    lifecycleAnchorDate,
    dayNumber,
    dayTotal: GO21_CYCLE_DAYS,
    lifecycleStage,
    enrollmentStatus: enrollment.status,
    milestones,
    customerProfile: {
      displayName: customer?.display_name ? String(customer.display_name) : "你",
      sex,
      birthDate: customer?.birth_date ? String(customer.birth_date) : null,
      birthYear: customer?.birth_year != null ? Number(customer.birth_year) : null,
      heightCm,
    },
    latestBody: latest
      ? {
          recordDate: String(latest.record_date).slice(0, 10),
          weightKg: latest.weight_kg != null ? Number(latest.weight_kg) : null,
          bodyFatPercent: latest.body_fat_percent != null ? Number(latest.body_fat_percent) : null,
          skeletalMuscleKg:
            latest.skeletal_muscle_kg != null ? Number(latest.skeletal_muscle_kg) : null,
          visceralFatLevel:
            latest.visceral_fat_level != null ? Number(latest.visceral_fat_level) : null,
          basalMetabolicRate:
            latest.basal_metabolic_rate != null ? Number(latest.basal_metabolic_rate) : null,
        }
      : null,
    needsBaseline,
  };
}

export function hasMeasurementNearDay(
  startDate: string,
  dayNumber: number,
  dates: Set<string>,
): boolean {
  const target = addCalendarDays(startDate, dayNumber - 1);
  for (let delta = -1; delta <= 1; delta += 1) {
    if (dates.has(addCalendarDays(target, delta))) return true;
  }
  return false;
}

async function loadEnrollment(enrollmentId: string): Promise<EnrollmentRow | null> {
  const supabase = createSupabaseServiceClient();
  const primary = await supabase
    .from("coaching_enrollments")
    .select(
      "id, goal, status, started_at, planned_end_at, plan_snapshot_json, onboarding_completed_at, go21_started_at, customer_id, owner_member_id",
    )
    .eq("id", enrollmentId)
    .maybeSingle();

  if (primary.error && /go21_started_at/.test(primary.error.message)) {
    const fallback = await supabase
      .from("coaching_enrollments")
      .select(
        "id, goal, status, started_at, planned_end_at, plan_snapshot_json, onboarding_completed_at, customer_id, owner_member_id",
      )
      .eq("id", enrollmentId)
      .maybeSingle();
    return (fallback.data as EnrollmentRow | null) ?? null;
  }
  return (primary.data as EnrollmentRow | null) ?? null;
}

/** Idempotent start of Go21 customer experience. */
export async function markGo21Started(
  enrollmentId: string,
): Promise<{ startedAt: string; already: boolean }> {
  const supabase = createSupabaseServiceClient();
  const { data: existing, error: readError } = await supabase
    .from("coaching_enrollments")
    .select("go21_started_at, onboarding_completed_at")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (readError && !/go21_started_at/.test(readError.message)) {
    throw new CoachingServiceError(readError.message, 500);
  }

  if (existing && "go21_started_at" in existing && existing.go21_started_at) {
    return { startedAt: String(existing.go21_started_at), already: true };
  }

  const startedAt = new Date().toISOString();
  const { error } = await supabase
    .from("coaching_enrollments")
    .update({
      go21_started_at: startedAt,
      onboarding_completed_at: existing?.onboarding_completed_at ?? startedAt,
      updated_at: startedAt,
    })
    .eq("id", enrollmentId);

  if (error && /go21_started_at/.test(error.message)) {
    const { error: fallbackError } = await supabase
      .from("coaching_enrollments")
      .update({
        onboarding_completed_at: existing?.onboarding_completed_at ?? startedAt,
        updated_at: startedAt,
      })
      .eq("id", enrollmentId);
    if (fallbackError) throw new CoachingServiceError(fallbackError.message, 500);
    return { startedAt, already: Boolean(existing?.onboarding_completed_at) };
  }
  if (error) throw new CoachingServiceError(error.message, 500);

  return { startedAt, already: false };
}
