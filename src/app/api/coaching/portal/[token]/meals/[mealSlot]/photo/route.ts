import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured, createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  attachMealPhoto,
  buildCoachingMealPhotoPath,
  CoachingServiceError,
  resolveActiveCoachingPortal,
} from "@/lib/coaching/coaching-service";
import { isCoachingMealSlot } from "@/lib/coaching/coaching-api-error";
import { requireAllowedCoachingLogDate } from "@/lib/coaching/require-allowed-coaching-log-date";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string; mealSlot: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { token, mealSlot } = await context.params;
    if (!isCoachingMealSlot(mealSlot)) {
      return NextResponse.json({ error: "Invalid meal slot." }, { status: 400 });
    }

    const portal = await resolveActiveCoachingPortal(token);
    const formData = await request.formData();
    const logDate = requireAllowedCoachingLogDate(String(formData.get("logDate") ?? coachingTodayLogDate()));
    const file = formData.get("photo");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "photo is required." }, { status: 400 });
    }

    const photoId = randomUUID();
    const storagePath = buildCoachingMealPhotoPath({
      customerId: portal.customerId,
      enrollmentId: portal.enrollmentId,
      logDate,
      mealSlot,
      photoId,
    });

    const arrayBuffer = await file.arrayBuffer();
    const supabase = createSupabaseServiceClient();
    const { error: uploadError } = await supabase.storage
      .from("coaching-meal-photos")
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      throw new CoachingServiceError(uploadError.message, 500);
    }

    const mealEntry = await attachMealPhoto({
      portal,
      logDate,
      mealSlot,
      storagePath,
    });

    return NextResponse.json({
      ok: true,
      storagePath,
      mealEntryId: mealEntry.id,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to upload meal photo.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
