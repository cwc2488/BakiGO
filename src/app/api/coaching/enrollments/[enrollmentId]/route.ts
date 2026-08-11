import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured, createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  createSignedCoachingPhotoUrl,
  getCoachingDailyLogDetail,
  getCoachingEnrollmentForCoach,
  listCoachingDailyLogsForEnrollment,
  serializeCoachingDailyLogDetail,
  serializeCoachingEnrollment,
  updateCoachingEnrollment,
} from "@/lib/coaching/coaching-service";
import { parseCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { BodyCompositionRecord, CustomerProgressPhoto } from "@/types/customer";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    const url = new URL(request.url);
    const logDate = url.searchParams.get("logDate") ?? coachingTodayLogDate();

    const enrollment = await getCoachingEnrollmentForCoach({
      enrollmentId,
      ownerMemberId: memberId,
    });

    const dailyLog = await getCoachingDailyLogDetail({
      enrollmentId,
      logDate,
      ownerMemberId: memberId,
    });

    const recentLogs = await listCoachingDailyLogsForEnrollment({
      enrollmentId,
      ownerMemberId: memberId,
      limit: 14,
    });

    const supabase = createSupabaseServiceClient();
    const { data: bodyRecords, error: bodyError } = await supabase
      .from("body_composition_records")
      .select("*")
      .eq("customer_id", enrollment.customerId)
      .order("record_date", { ascending: false });

    if (bodyError) {
      throw new CoachingServiceError(bodyError.message, 500);
    }

    const { data: progressPhotos, error: photoError } = await supabase
      .from("customer_progress_photos")
      .select("id, customer_id, phase, angle, photo_date, image_data_url, note, created_at, updated_at")
      .eq("customer_id", enrollment.customerId)
      .order("photo_date", { ascending: false });

    if (photoError) {
      throw new CoachingServiceError(photoError.message, 500);
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("display_name")
      .eq("id", enrollment.customerId)
      .maybeSingle();

    if (customerError) {
      throw new CoachingServiceError(customerError.message, 500);
    }

    const dailyLogWithSignedUrls = await attachSignedMealPhotoUrls(dailyLog);
    const recentLogsWithSignedUrls = await Promise.all(recentLogs.map(attachSignedMealPhotoUrls));

    return NextResponse.json({
      ok: true,
      enrollment: serializeCoachingEnrollment(enrollment),
      customerDisplayName: customer?.display_name ? String(customer.display_name) : "顧客",
      dailyLog: dailyLogWithSignedUrls,
      recentLogs: recentLogsWithSignedUrls,
      bodyRecords: (bodyRecords ?? []).map(mapBodyRecordRow),
      progressPhotos: (progressPhotos ?? []).map(mapProgressPhotoRow),
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load coaching detail.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    const body = (await request.json()) as {
      status?: "active" | "paused" | "completed";
      goal?: string | null;
      planSnapshot?: unknown;
    };

    const enrollment = await updateCoachingEnrollment({
      enrollmentId,
      ownerMemberId: memberId,
      status: body.status,
      goal: body.goal,
      planSnapshot: body.planSnapshot ? parseCoachingPlanSnapshot(body.planSnapshot) : undefined,
    });

    return NextResponse.json({
      ok: true,
      enrollment: serializeCoachingEnrollment(enrollment),
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to update coaching enrollment.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function attachSignedMealPhotoUrls(detail: Awaited<ReturnType<typeof getCoachingDailyLogDetail>>) {
  const serialized = serializeCoachingDailyLogDetail(detail);
  const meals = await Promise.all(
    serialized.meals.map(async (meal) => {
      if (!meal.photo?.storagePath) {
        return meal;
      }
      const signedUrl = await createSignedCoachingPhotoUrl(meal.photo.storagePath);
      return {
        ...meal,
        photo: {
          ...meal.photo,
          signedUrl,
        },
      };
    }),
  );

  return {
    ...serialized,
    meals,
  };
}

function mapBodyRecordRow(row: Record<string, unknown>): BodyCompositionRecord {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    recordDate: String(row.record_date),
    age: row.age != null ? Number(row.age) : null,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    skeletalMuscleKg: row.skeletal_muscle_kg != null ? Number(row.skeletal_muscle_kg) : null,
    bodyFatKg: row.body_fat_kg != null ? Number(row.body_fat_kg) : null,
    bmi: row.bmi != null ? Number(row.bmi) : null,
    bodyFatPercent: row.body_fat_percent != null ? Number(row.body_fat_percent) : null,
    visceralFatLevel: row.visceral_fat_level != null ? Number(row.visceral_fat_level) : null,
    basalMetabolicRate: row.basal_metabolic_rate != null ? Number(row.basal_metabolic_rate) : null,
    bodyAge: row.body_age != null ? Number(row.body_age) : null,
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapProgressPhotoRow(row: Record<string, unknown>): CustomerProgressPhoto {
  return {
    id: String(row.id),
    customerId: String(row.customer_id ?? ""),
    phase: row.phase as CustomerProgressPhoto["phase"],
    angle: row.angle as CustomerProgressPhoto["angle"],
    photoDate: String(row.photo_date),
    imageDataUrl: row.image_data_url ? String(row.image_data_url) : null,
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}
