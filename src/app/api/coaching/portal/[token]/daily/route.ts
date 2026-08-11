import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  createSignedCoachingPhotoUrl,
  resolveActiveCoachingPortal,
  serializeCoachingDailyLogDetail,
  upsertCoachingDailyLog,
} from "@/lib/coaching/coaching-service";
import { COACHING_MEAL_SLOTS, type CoachingMealSlot } from "@/types/coaching";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    const body = (await request.json()) as {
      logDate?: string;
      waterMl?: number | null;
      exerciseNote?: string | null;
      bowelMovementCount?: number | null;
      sleepDuration?: string | null;
      sleepBedtime?: string | null;
      sleepWakeTime?: string | null;
      customerNote?: string | null;
      meals?: Partial<Record<CoachingMealSlot, { textNote?: string | null; eatenAt?: string | null }>>;
      markSubmitted?: boolean;
    };

    const logDate = body.logDate ?? coachingTodayLogDate();
    const detail = await upsertCoachingDailyLog({
      portal,
      logDate,
      waterMl: body.waterMl,
      exerciseNote: body.exerciseNote,
      bowelMovementCount: body.bowelMovementCount,
      sleepBedtime: body.sleepBedtime,
      sleepWakeTime: body.sleepWakeTime,
      customerNote: body.customerNote,
      meals: body.meals,
      markSubmitted: body.markSubmitted,
    });

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

    return NextResponse.json({
      ok: true,
      dailyLog: {
        ...serialized,
        meals,
      },
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to save daily report.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    const url = new URL(request.url);
    const logDate = url.searchParams.get("logDate") ?? coachingTodayLogDate();

    const { getCoachingDailyLogDetail, serializeCoachingDailyLogDetail, createSignedCoachingPhotoUrl: signUrl } =
      await import("@/lib/coaching/coaching-service");

    const detail = await getCoachingDailyLogDetail({
      enrollmentId: portal.enrollmentId,
      logDate,
    });

    const serialized = serializeCoachingDailyLogDetail(detail);
    const meals = await Promise.all(
      serialized.meals.map(async (meal) => {
        if (!meal.photo?.storagePath) {
          return meal;
        }
        const signedUrl = await signUrl(meal.photo.storagePath);
        return {
          ...meal,
          photo: {
            ...meal.photo,
            signedUrl,
          },
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      logDate,
      dailyLog: {
        ...serialized,
        meals,
      },
      mealSlots: COACHING_MEAL_SLOTS,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load daily report.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
