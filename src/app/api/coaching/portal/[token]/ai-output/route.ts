import { NextResponse } from "next/server";
import { getCoachingAiOutputForDay } from "@/lib/coaching/ai/coaching-ai-store";
import { kickCoachingGenerationWorkerBestEffort } from "@/lib/coaching/ai/kick-coaching-generation-worker";
import {
  markRecoveryKick,
  recoverStalePendingCoachingAiOutput,
  shouldRateLimitRecoveryKick,
} from "@/lib/coaching/ai/recover-stale-coaching-ai-output";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  getCoachingDailyLogDetail,
  resolveActiveCoachingPortal,
} from "@/lib/coaching/coaching-service";
import { loadImmediateDailyFeedbackForPortal } from "@/lib/coaching/load-immediate-daily-feedback";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { requireAllowedCoachingLogDate } from "@/lib/coaching/require-allowed-coaching-log-date";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type { CoachingDailyGenerationCustomerOutput } from "@/types/coaching-ai";
import type { ImmediateDailyFeedback } from "@/lib/coaching/immediate-daily-feedback";
import {
  resolveCustomerFacingAiProgress,
  type CustomerFacingAiProgressStep,
} from "@/lib/coaching/ai/customer-facing-ai-progress";

export const runtime = "nodejs";

export type CustomerFacingAiOutputPayload = {
  status: "pending" | "processing" | "completed" | "failed" | "missing";
  customer: CoachingDailyGenerationCustomerOutput | null;
  errorMessage: string | null;
  /** Human progress steps derived only from real backend status. */
  progressSteps: CustomerFacingAiProgressStep[];
  activeStep: CustomerFacingAiProgressStep;
};

/** Portal read of customer-facing AI feedback only (no coach fields). */
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

    const dailyLog = await getCoachingDailyLogDetail({
      enrollmentId: portal.enrollmentId,
      logDate,
    });

    let immediateFeedback: ImmediateDailyFeedback | null = null;
    if (dailyLog.id && dailyLog.submittedAt) {
      immediateFeedback = await loadImmediateDailyFeedbackForPortal({
        enrollmentId: portal.enrollmentId,
        ownerMemberId: portal.ownerMemberId,
        logDate,
        dailyLog,
      });
    }

    let output = await getCoachingAiOutputForDay({
      enrollmentId: portal.enrollmentId,
      logDate,
    });

    const hasMealPhotos = dailyLog.meals.some(
      (meal) =>
        (meal.mealSlot === "breakfast" || meal.mealSlot === "lunch" || meal.mealSlot === "dinner") &&
        Boolean(meal.photo?.storagePath),
    );

    // Rate-limited stale pending recovery — never awaits full AI generation.
    if (
      dailyLog.submittedAt &&
      output &&
      (output.status === "pending" || output.status === "processing")
    ) {
      const key = `${portal.enrollmentId}:${logDate}`;
      const nowMs = Date.now();
      if (!shouldRateLimitRecoveryKick({ key, nowMs })) {
        markRecoveryKick({ key, nowMs });
        try {
          const recovery = await recoverStalePendingCoachingAiOutput({
            enrollmentId: portal.enrollmentId,
            ownerMemberId: portal.ownerMemberId,
            customerId: portal.customerId,
            logDate,
            nowMs,
          });
          if (recovery.planned.action === "requeue" || recovery.requeuedJobId) {
            kickCoachingGenerationWorkerBestEffort({
              limit: 2,
              concurrency: 1,
              source: "ai_output_stale_recovery",
            });
          } else if (recovery.planned.action === "reclaim_only") {
            kickCoachingGenerationWorkerBestEffort({
              limit: 2,
              concurrency: 1,
              source: "ai_output_reclaim_kick",
            });
          }
          output = await getCoachingAiOutputForDay({
            enrollmentId: portal.enrollmentId,
            logDate,
          });
        } catch (recoveryError) {
          console.error("[coaching] stale pending recovery failed", recoveryError);
        }
      }
    }

    if (!output) {
      const progress = resolveCustomerFacingAiProgress({ status: "missing", hasMealPhotos });
      const payload: CustomerFacingAiOutputPayload = {
        status: "missing",
        customer: null,
        errorMessage: null,
        ...progress,
      };
      return NextResponse.json({ ok: true, logDate, aiOutput: payload, immediateFeedback });
    }

    const progress = resolveCustomerFacingAiProgress({ status: output.status, hasMealPhotos });
    const payload: CustomerFacingAiOutputPayload = {
      status: output.status,
      customer:
        output.status === "completed" && output.outputJson
          ? {
              encouragement: output.outputJson.customer.encouragement,
              today_feedback: output.outputJson.customer.today_feedback,
              daily_food_summary: output.outputJson.customer.daily_food_summary,
              meal_feedback: output.outputJson.customer.meal_feedback,
              lifestyle_feedback: output.outputJson.customer.lifestyle_feedback,
              customer_voice_response: output.outputJson.customer.customer_voice_response,
              adjustment_priorities: output.outputJson.customer.adjustment_priorities.slice(0, 2),
              tomorrow_focus: output.outputJson.customer.tomorrow_focus,
              follow_up_for_tomorrow: output.outputJson.customer.follow_up_for_tomorrow,
            }
          : null,
      errorMessage: output.status === "failed" ? output.errorMessage : null,
      ...progress,
    };
    return NextResponse.json({ ok: true, logDate, aiOutput: payload, immediateFeedback });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load coaching AI output.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
