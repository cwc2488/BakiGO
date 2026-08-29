import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { resolveActiveCoachingPortal, type ResolvedCoachingPortal } from "@/lib/coaching/coaching-service";
import { isExperience21dEnrollment, experience21dFromPlanSnapshot } from "@/lib/coaching/experience-21d";
import { coachingJourneyDayNumberInWindow } from "@/lib/coaching/enrollment-window";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import {
  GO21_BRAND_NAME,
  GO21_BRAND_SUBTITLE,
  GO21_CYCLE_DAYS,
  type Go21ProgressMilestone,
} from "@/types/go21";
import { getSharedInMemoryV2Store } from "@/lib/coaching/ai/v2/memory-store";
import { buildLifecycleSnapshot } from "@/lib/coaching/ai/v2/lifecycle";

export type Go21PortalBundle = {
  brandName: typeof GO21_BRAND_NAME;
  brandSubtitle: typeof GO21_BRAND_SUBTITLE;
  portal: ResolvedCoachingPortal;
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  isGo21: boolean;
  go21StartedAt: string | null;
  dayNumber: number | null;
  dayTotal: number;
  lifecycleStage: string;
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

export async function loadGo21PortalBundle(token: string): Promise<Go21PortalBundle> {
  const portal = await resolveActiveCoachingPortal(token);
  const supabase = createSupabaseServiceClient();

  const enrollmentQuery = await supabase
    .from("coaching_enrollments")
    .select(
      "id, goal, status, started_at, planned_end_at, plan_snapshot_json, onboarding_completed_at, go21_started_at, customer_id, owner_member_id",
    )
    .eq("id", portal.enrollmentId)
    .maybeSingle();

  let enrollment = enrollmentQuery.data;
  if (enrollmentQuery.error && /go21_started_at/.test(enrollmentQuery.error.message)) {
    const fallback = await supabase
      .from("coaching_enrollments")
      .select(
        "id, goal, status, started_at, planned_end_at, plan_snapshot_json, onboarding_completed_at, customer_id, owner_member_id",
      )
      .eq("id", portal.enrollmentId)
      .maybeSingle();
    enrollment = fallback.data as typeof enrollment;
  }

  if (!enrollment) {
    throw new Error("Enrollment not found");
  }

  const enrollmentLike = {
    planSnapshot:
      enrollment.plan_snapshot_json && typeof enrollment.plan_snapshot_json === "object"
        ? (enrollment.plan_snapshot_json as {
            experience21d?: { productReceivedDate: string; interestId?: string };
          })
        : {},
  };

  const isGo21 =
    isExperience21dEnrollment(enrollmentLike as never) ||
    Boolean(experience21dFromPlanSnapshot(enrollmentLike.planSnapshot as never));

  const today = coachingTodayLogDate();
  const dayNumber = coachingJourneyDayNumberInWindow({
    startedAt: enrollment.started_at,
    plannedEndAt: enrollment.planned_end_at,
    logDate: today,
  });

  const { data: customer } = await supabase
    .from("customers")
    .select("display_name, sex, birth_date, birth_year, height_cm")
    .eq("id", portal.customerId)
    .maybeSingle();

  const { data: bodyRows } = await supabase
    .from("body_composition_records")
    .select(
      "record_date, weight_kg, body_fat_percent, skeletal_muscle_kg, visceral_fat_level, basal_metabolic_rate",
    )
    .eq("customer_id", portal.customerId)
    .order("record_date", { ascending: false })
    .limit(5);

  const latest = bodyRows?.[0] ?? null;
  const sex = customer?.sex ? String(customer.sex) : null;
  const heightCm = customer?.height_cm != null ? Number(customer.height_cm) : null;
  const hasWeight = latest?.weight_kg != null;
  const needsBaseline = !sex || heightCm == null || !hasWeight;

  const go21Raw =
    "go21_started_at" in enrollment ? (enrollment as { go21_started_at?: string | null }).go21_started_at : null;
  const go21StartedAt = go21Raw
    ? String(go21Raw)
    : enrollment.onboarding_completed_at
      ? String(enrollment.onboarding_completed_at)
      : null;

  const measurementDates = new Set(
    (bodyRows ?? []).map((r) => String(r.record_date).slice(0, 10)),
  );

  const startDate = String(enrollment.started_at).slice(0, 10);
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
      completed: hasMeasurementNearDay(startDate, 7, measurementDates),
    },
    {
      day: 14,
      label: "量測",
      kind: "measurement",
      optional: true,
      reached: (dayNumber ?? 0) >= 14,
      completed: hasMeasurementNearDay(startDate, 14, measurementDates),
    },
    {
      day: 21,
      label: "最終量測 / 21天回顧",
      kind: "review",
      optional: true,
      reached: (dayNumber ?? 0) >= 21,
      completed: hasMeasurementNearDay(startDate, 21, measurementDates) || (dayNumber ?? 0) > 21,
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

  return {
    brandName: GO21_BRAND_NAME,
    brandSubtitle: GO21_BRAND_SUBTITLE,
    portal,
    enrollmentId: portal.enrollmentId,
    customerId: portal.customerId,
    ownerMemberId: portal.ownerMemberId,
    isGo21,
    go21StartedAt,
    dayNumber,
    dayTotal: GO21_CYCLE_DAYS,
    lifecycleStage,
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

function hasMeasurementNearDay(
  startDate: string,
  dayNumber: number,
  dates: Set<string>,
): boolean {
  const [y, m, d] = startDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  anchor.setUTCDate(anchor.getUTCDate() + (dayNumber - 1));
  for (let delta = -1; delta <= 1; delta += 1) {
    const probe = new Date(anchor);
    probe.setUTCDate(probe.getUTCDate() + delta);
    const iso = `${probe.getUTCFullYear()}-${String(probe.getUTCMonth() + 1).padStart(2, "0")}-${String(probe.getUTCDate()).padStart(2, "0")}`;
    if (dates.has(iso)) return true;
  }
  return false;
}

/** Idempotent start of Go21 customer experience. */
export async function markGo21Started(
  enrollmentId: string,
): Promise<{ startedAt: string; already: boolean }> {
  const supabase = createSupabaseServiceClient();
  const { data: existing } = await supabase
    .from("coaching_enrollments")
    .select("go21_started_at, onboarding_completed_at")
    .eq("id", enrollmentId)
    .maybeSingle();

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
    await supabase
      .from("coaching_enrollments")
      .update({
        onboarding_completed_at: existing?.onboarding_completed_at ?? startedAt,
        updated_at: startedAt,
      })
      .eq("id", enrollmentId);
    return { startedAt, already: Boolean(existing?.onboarding_completed_at) };
  }

  return { startedAt, already: false };
}
