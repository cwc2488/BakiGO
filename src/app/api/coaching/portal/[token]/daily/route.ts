import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  resolveActiveCoachingPortal,
  serializeCoachingDailyLogDetail,
  upsertCoachingDailyLog,
} from "@/lib/coaching/coaching-service";
import { schedulePostSubmitEnqueueAndDrain } from "@/lib/coaching/ai/schedule-post-submit-enqueue";
import { createSubmitTimer } from "@/lib/coaching/coaching-submit-timing";
import { loadImmediateDailyFeedbackForSubmit } from "@/lib/coaching/load-immediate-daily-feedback-fast";
import { loadImmediateDailyFeedbackForPortal } from "@/lib/coaching/load-immediate-daily-feedback";
import { requireAllowedCoachingLogDate } from "@/lib/coaching/require-allowed-coaching-log-date";
import { COACHING_MEAL_SLOTS, type CoachingMealSlot } from "@/types/coaching";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  const timer = createSubmitTimer();
  const timing: Record<string, number | boolean> = {};

  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    timing.token_validation_ms = timer.lap("token_validation_ms");

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

    const logDate = requireAllowedCoachingLogDate(body.logDate ?? coachingTodayLogDate());
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
    timing.daily_log_upsert_ms = timer.lap("daily_log_upsert_ms");

    // Layer 1 only — must stay on critical path; everything else after response.
    const immediateFeedback = body.markSubmitted
      ? await loadImmediateDailyFeedbackForSubmit({
          enrollmentId: portal.enrollmentId,
          logDate,
          dailyLog: detail,
        })
      : null;
    timing.immediate_feedback_ms = timer.lap("immediate_feedback_ms");

    // AI enqueue + worker drain are AFTER response — never block customer.
    let generationEnqueue: { action: string; reason?: string; submitted_at?: string } | null = null;
    let afterRegistrationMs = 0;
    if (body.markSubmitted) {
      const submittedAt = detail.submittedAt ?? new Date().toISOString();
      const afterStarted = Date.now();
      console.info(
        JSON.stringify({
          type: "coaching_submit_received",
          enrollmentId: portal.enrollmentId,
          logDate,
          submitted_at: submittedAt,
        }),
      );
      schedulePostSubmitEnqueueAndDrain({
        enrollmentId: portal.enrollmentId,
        ownerMemberId: portal.ownerMemberId,
        customerId: portal.customerId,
        logDate,
        submittedAt,
      });
      afterRegistrationMs = Math.max(0, Date.now() - afterStarted);
      generationEnqueue = {
        action: "scheduled_after_response",
        reason: "enqueue_and_drain_deferred",
        submitted_at: submittedAt,
      };
      timing.job_enqueue_scheduled = true;
    } else {
      timing.job_enqueue_scheduled = false;
    }
    timing.after_registration_ms = afterRegistrationMs;

    // Submit response: skip signed URL work (not required for Layer 1).
    const photoSignStarted = Date.now();
    const serialized = serializeCoachingDailyLogDetail(detail);
    const meals = serialized.meals.map((meal) => meal);
    timing.photo_sign_ms = Math.max(0, Date.now() - photoSignStarted);

    timing.response_total_ms = timer.sinceStart();
    console.info(
      JSON.stringify({
        type: "coaching_submit_critical_path_timing",
        enrollmentId: portal.enrollmentId,
        logDate,
        markSubmitted: Boolean(body.markSubmitted),
        ...timing,
      }),
    );

    return NextResponse.json({
      ok: true,
      dailyLog: {
        ...serialized,
        meals,
      },
      immediateFeedback,
      generationEnqueue,
      _timing: timing,
    });
  } catch (error) {
    timing.response_total_ms = timer.sinceStart();
    console.info(
      JSON.stringify({
        type: "coaching_submit_critical_path_timing",
        error: true,
        ...timing,
      }),
    );
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
    const logDate = requireAllowedCoachingLogDate(url.searchParams.get("logDate") ?? coachingTodayLogDate());

    const { getCoachingDailyLogDetail, serializeCoachingDailyLogDetail, createSignedCoachingPhotoUrl: signUrl } =
      await import("@/lib/coaching/coaching-service");

    const detail = await getCoachingDailyLogDetail({
      enrollmentId: portal.enrollmentId,
      logDate,
    });

    if (!detail.id) {
      return NextResponse.json({
        ok: true,
        logDate,
        dailyLog: null,
        immediateFeedback: null,
        mealSlots: COACHING_MEAL_SLOTS,
      });
    }

    const immediateFeedback = detail.submittedAt
      ? await loadImmediateDailyFeedbackForPortal({
          enrollmentId: portal.enrollmentId,
          ownerMemberId: portal.ownerMemberId,
          logDate,
          dailyLog: detail,
        })
      : null;

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
      immediateFeedback,
      mealSlots: COACHING_MEAL_SLOTS,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load daily report.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
