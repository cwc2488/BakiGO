import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError, getActiveEnrollmentForCustomer } from "@/lib/coaching/coaching-service";
import { mapBodyRecordRow } from "@/lib/coaching/ai/load-coaching-generation-context";
import { buildGrowthIntelligence } from "@/lib/coaching/growth/build-growth-intelligence";
import { getLatestExperienceCheckin } from "@/lib/coaching/growth/experience-checkin-service";
import { persistGrowthMatrixEvaluation } from "@/lib/coaching/growth/growth-opportunity-service";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Event hook: body measurement saved (or enrollment lifecycle).
 * Retries briefly when expectRecordDate is not yet visible (local→cloud race).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ customerId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { customerId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
      logDate?: string;
      expectRecordDate?: string;
    };
    const enrollment = await getActiveEnrollmentForCustomer({
      customerId,
      ownerMemberId: memberId,
    });
    if (!enrollment) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_active_enrollment" });
    }

    const logDate = body.logDate ?? coachingTodayLogDate();
    const expectRecordDate = body.expectRecordDate?.slice(0, 10) ?? null;
    const supabase = createSupabaseServiceClient();

    let bodyRows: Record<string, unknown>[] = [];
    let sawExpected = !expectRecordDate;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data } = await supabase
        .from("body_composition_records")
        .select("*")
        .eq("customer_id", customerId)
        .order("record_date", { ascending: false });
      bodyRows = (data ?? []) as Record<string, unknown>[];
      if (!expectRecordDate) {
        sawExpected = true;
        break;
      }
      sawExpected = bodyRows.some((row) => String(row.record_date ?? "").slice(0, 10) === expectRecordDate);
      if (sawExpected) break;
      await sleep(400 * (attempt + 1));
    }

    if (expectRecordDate && !sawExpected) {
      return NextResponse.json(
        {
          ok: false,
          error: "measurement_not_yet_visible",
          expectRecordDate,
          hint: "Cloud push may still be in flight; retry reconcile.",
        },
        { status: 409 },
      );
    }

    const checkin = await getLatestExperienceCheckin({
      enrollmentId: enrollment.id,
      ownerMemberId: memberId,
    }).catch(() => null);

    const matrix = buildGrowthIntelligence({
      enrollment,
      ownerMemberId: memberId,
      bodyRecords: bodyRows.map((row) => mapBodyRecordRow(row)),
      logDate,
      checkin,
      attentionTier: "routine",
      finalInterventionLevel: "normal",
    });

    const persisted = await persistGrowthMatrixEvaluation({
      enrollmentId: enrollment.id,
      ownerMemberId: memberId,
      matrix,
      asOfIso: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      reason: body.reason ?? "manual",
      plan: persisted.plan.action,
      readiness: matrix.readiness,
      outcomeBand: matrix.outcomeBand,
      sawExpectedMeasurement: sawExpected,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to reconcile growth.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
