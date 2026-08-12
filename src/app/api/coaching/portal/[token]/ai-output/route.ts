import { NextResponse } from "next/server";
import { getCoachingAiOutputForDay } from "@/lib/coaching/ai/coaching-ai-store";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError, resolveActiveCoachingPortal } from "@/lib/coaching/coaching-service";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type { CoachingDailyGenerationCustomerOutput } from "@/types/coaching-ai";

export const runtime = "nodejs";

export type CustomerFacingAiOutputPayload = {
  status: "pending" | "processing" | "completed" | "failed" | "missing";
  customer: CoachingDailyGenerationCustomerOutput | null;
  errorMessage: string | null;
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
    const logDate = url.searchParams.get("logDate") ?? coachingTodayLogDate();

    const output = await getCoachingAiOutputForDay({
      enrollmentId: portal.enrollmentId,
      logDate,
    });

    if (!output) {
      const payload: CustomerFacingAiOutputPayload = {
        status: "missing",
        customer: null,
        errorMessage: null,
      };
      return NextResponse.json({ ok: true, logDate, aiOutput: payload });
    }

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
    };

    return NextResponse.json({ ok: true, logDate, aiOutput: payload });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load coaching AI output.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
