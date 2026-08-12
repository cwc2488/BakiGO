import { NextResponse } from "next/server";
import { loadCoachingCommandCenter } from "@/lib/coaching/attention/load-command-center-batch";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { coachingTaipeiHour, coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const url = new URL(request.url);
    const logDate = url.searchParams.get("logDate") ?? coachingTodayLogDate();
    const hourParam = url.searchParams.get("asOfHourTaipei");
    const asOfHourTaipei =
      hourParam != null && hourParam !== "" ? Number(hourParam) : coachingTaipeiHour();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return NextResponse.json({ error: "Invalid logDate" }, { status: 400 });
    }
    if (!Number.isFinite(asOfHourTaipei) || asOfHourTaipei < 0 || asOfHourTaipei > 23) {
      return NextResponse.json({ error: "Invalid asOfHourTaipei" }, { status: 400 });
    }

    const { result, audit } = await loadCoachingCommandCenter({
      ownerMemberId: memberId,
      asOfLogDate: logDate,
      asOfHourTaipei,
    });

    // Event: Attention → coach_attention — best-effort Growth reconcile (Rescue > Growth)
    const attentionIds = result.sections.needsAttention
      .filter((item) => item.assessment.tier === "coach_attention")
      .slice(0, 15)
      .map((item) => item.enrollmentId);
    if (attentionIds.length > 0) {
      const { triggerGrowthReconcileBestEffort } = await import(
        "@/lib/coaching/growth/trigger-growth-reconcile"
      );
      for (const enrollmentId of attentionIds) {
        void triggerGrowthReconcileBestEffort({
          enrollmentId,
          ownerMemberId: memberId,
          logDate,
          forceCoachAttention: true,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      ...result,
      audit,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load coaching command center.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
