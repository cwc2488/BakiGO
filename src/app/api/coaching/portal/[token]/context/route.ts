import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
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
import { listCoachingRecentDaySummaries } from "@/lib/coaching/list-coaching-recent-day-summaries";
import { buildCoachingProgressView } from "@/lib/coaching/build-coaching-progress-view";
import { mapBodyRecordRow } from "@/lib/coaching/ai/load-coaching-generation-context";
import { requireAllowedCoachingLogDate } from "@/lib/coaching/require-allowed-coaching-log-date";

export const runtime = "nodejs";

async function loadPortalProgress(input: {
  enrollmentId: string;
  customerId: string;
  goal: string | null | undefined;
  startedAt: string | null | undefined;
  logDate: string;
}) {
  const supabase = createSupabaseServiceClient();
  const [{ data: enrollment }, { data: bodyRows }] = await Promise.all([
    supabase
      .from("coaching_enrollments")
      .select("goal, started_at, baseline_body_record_id")
      .eq("id", input.enrollmentId)
      .maybeSingle(),
    supabase
      .from("body_composition_records")
      .select("*")
      .eq("customer_id", input.customerId)
      .order("record_date", { ascending: false }),
  ]);

  return buildCoachingProgressView({
    enrollment: {
      goal: enrollment?.goal ?? input.goal ?? null,
      startedAt: enrollment?.started_at ?? input.startedAt ?? `${input.logDate}T00:00:00.000Z`,
      baselineBodyRecordId: enrollment?.baseline_body_record_id ?? null,
    },
    bodyRecords: (bodyRows ?? []).map((row) => mapBodyRecordRow(row as Record<string, unknown>)),
    logDate: input.logDate,
  });
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
    const url = new URL(request.url);
    const requestedLogDate = url.searchParams.get("logDate") ?? coachingTodayLogDate();
    const logDate = requireAllowedCoachingLogDate(requestedLogDate);

    const contextPayload = await resolveCoachingPortalContext(token);
    if (!contextPayload?.validToken) {
      return NextResponse.json({ error: "連結無效或已過期" }, { status: 404 });
    }

    if (!contextPayload.hasActiveEnrollment || !contextPayload.enrollmentId || !contextPayload.customerId) {
      return NextResponse.json({
        ok: true,
        context: contextPayload,
        dailyLog: null,
        logDate,
        recentDays: [],
        progress: null,
      });
    }

    const portal = await resolveActiveCoachingPortal(token);
    const [recentDays, progress] = await Promise.all([
      listCoachingRecentDaySummaries({
        enrollmentId: portal.enrollmentId,
        enrollmentStartedAt: contextPayload.startedAt ?? null,
        limit: 3,
      }),
      loadPortalProgress({
        enrollmentId: contextPayload.enrollmentId,
        customerId: contextPayload.customerId,
        goal: contextPayload.goal,
        startedAt: contextPayload.startedAt,
        logDate,
      }),
    ]);

    const dailyLog = await getCoachingDailyLogDetail({
      enrollmentId: portal.enrollmentId,
      logDate,
    });

    if (!dailyLog.id) {
      return NextResponse.json({
        ok: true,
        context: contextPayload,
        logDate,
        recentDays,
        progress,
        dailyLog: null,
      });
    }

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
      recentDays,
      progress,
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
