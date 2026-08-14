import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  assertCoachOwnsMealPhoto,
  createSignedCoachingPhotoUrl,
  getCoachingEnrollmentForCoach,
} from "@/lib/coaching/coaching-service";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

/**
 * Lazy-sign meal photo URLs for a single log_date after Timeline expand.
 * Never used for bulk 90-day signing.
 */
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
    const logDate = url.searchParams.get("logDate");
    if (!logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return NextResponse.json({ error: "Invalid logDate" }, { status: 400 });
    }

    await getCoachingEnrollmentForCoach({ enrollmentId, ownerMemberId: memberId });

    const supabase = createSupabaseServiceClient();
    const { data: logRow, error: logError } = await supabase
      .from("coaching_daily_logs")
      .select(
        `
        id,
        enrollment_id,
        owner_member_id,
        log_date,
        coaching_meal_entries (
          id,
          meal_slot,
          coaching_meal_photos (id, storage_path, meal_entry_id)
        )
      `,
      )
      .eq("enrollment_id", enrollmentId)
      .eq("owner_member_id", memberId)
      .eq("log_date", logDate)
      .is("deleted_at", null)
      .maybeSingle();
    if (logError) {
      throw new CoachingServiceError(logError.message, 500);
    }
    if (!logRow) {
      return NextResponse.json({ ok: true, logDate, photos: [] });
    }

    const photos: Array<{
      mealSlot: string;
      mealEntryId: string;
      storagePath: string;
      signedUrl: string | null;
    }> = [];

    const meals = (logRow.coaching_meal_entries as Array<Record<string, unknown>> | null) ?? [];
    for (const meal of meals) {
      const mealPhotos = (meal.coaching_meal_photos as Array<Record<string, unknown>> | null) ?? [];
      const photo = mealPhotos[0];
      if (!photo?.storage_path) continue;
      const storagePath = String(photo.storage_path);
      assertCoachOwnsMealPhoto(memberId, storagePath);
      const signedUrl = await createSignedCoachingPhotoUrl(storagePath);
      photos.push({
        mealSlot: String(meal.meal_slot),
        mealEntryId: String(meal.id),
        storagePath,
        signedUrl,
      });
    }

    return NextResponse.json({ ok: true, logDate, photos });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to sign meal photos.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
