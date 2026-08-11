import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  createSignedCoachingPhotoUrl,
  getCoachingDailyLogDetail,
  resolveCoachingPortalContext,
  resolveActiveCoachingPortal,
  serializeCoachingDailyLogDetail,
} from "@/lib/coaching/coaching-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { token } = await context.params;
    const contextPayload = await resolveCoachingPortalContext(token);
    if (!contextPayload?.validToken) {
      return NextResponse.json({ error: "連結無效或已過期" }, { status: 404 });
    }

    if (!contextPayload.hasActiveEnrollment || !contextPayload.enrollmentId) {
      return NextResponse.json({
        ok: true,
        context: contextPayload,
        dailyLog: null,
        logDate: coachingTodayLogDate(),
      });
    }

    const portal = await resolveActiveCoachingPortal(token);
    const logDate = coachingTodayLogDate();
    const dailyLog = await getCoachingDailyLogDetail({
      enrollmentId: portal.enrollmentId,
      logDate,
    });

    const serialized = serializeCoachingDailyLogDetail(dailyLog);
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
      context: contextPayload,
      logDate,
      dailyLog: {
        ...serialized,
        meals,
      },
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load coaching portal.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
