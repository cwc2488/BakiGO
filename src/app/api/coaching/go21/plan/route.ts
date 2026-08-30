import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured, createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  getActiveEnrollmentForCustomer,
} from "@/lib/coaching/coaching-service";
import { isExperience21dEnrollment } from "@/lib/coaching/experience-21d";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import {
  buildGo21CoachPlanSnapshot,
  loadGo21CoachPlanRecord,
  resolveGo21CoachPlanForDate,
  saveGo21CoachPlan,
  toGo21CoachPlanPublicView,
} from "@/lib/go21/coach-plan";
import { GO21_COACH_PLAN_PERIODS, GO21_COACH_PLAN_PERIOD_LABELS } from "@/types/go21";

export const runtime = "nodejs";

/** Coach-facing Coach Daily Plan GET/POST. Query: ?customerId= */
export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const customerId = new URL(request.url).searchParams.get("customerId")?.trim();
    if (!customerId) {
      return NextResponse.json({ error: "缺少 customerId" }, { status: 400 });
    }
    const enrollment = await getActiveEnrollmentForCustomer({
      customerId,
      ownerMemberId: memberId,
    });
    if (!enrollment || !isExperience21dEnrollment(enrollment)) {
      return NextResponse.json({ error: "尚未開通 Baki Go 21" }, { status: 404 });
    }
    const record = await loadGo21CoachPlanRecord(enrollment.id);
    const logDate = coachingTodayLogDate();
    return NextResponse.json({
      ok: true,
      enrollmentId: enrollment.id,
      plan: toGo21CoachPlanPublicView(record),
      todayItems: resolveGo21CoachPlanForDate(record, logDate),
      periods: GO21_COACH_PLAN_PERIODS.map((p) => ({
        id: p,
        label: GO21_COACH_PLAN_PERIOD_LABELS[p],
      })),
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法載入每日安排");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const body = (await request.json()) as {
      customerId?: string;
      enrollmentId?: string;
      items?: Array<{
        id?: string;
        period: string;
        name: string;
        amount?: string | null;
        instruction?: string | null;
        recurrence?: "daily" | "weekdays" | "weekends" | number[];
        sortOrder?: number;
        enabled?: boolean;
      }>;
      source?: "activation" | "coach_edit";
      effectiveFrom?: string | null;
    };
    const customerId = body.customerId?.trim();
    if (!customerId) {
      return NextResponse.json({ error: "缺少 customerId" }, { status: 400 });
    }

    let enrollmentId = body.enrollmentId?.trim() || null;
    if (!enrollmentId) {
      const enrollment = await getActiveEnrollmentForCustomer({
        customerId,
        ownerMemberId: memberId,
      });
      if (!enrollment || !isExperience21dEnrollment(enrollment)) {
        return NextResponse.json({ error: "尚未開通 Baki Go 21" }, { status: 404 });
      }
      enrollmentId = enrollment.id;
    } else {
      const supabase = createSupabaseServiceClient();
      const { data } = await supabase
        .from("coaching_enrollments")
        .select("id, customer_id, owner_member_id, plan_snapshot_json")
        .eq("id", enrollmentId)
        .maybeSingle();
      if (
        !data ||
        data.customer_id !== customerId ||
        data.owner_member_id !== memberId ||
        !isExperience21dEnrollment({ planSnapshot: data.plan_snapshot_json })
      ) {
        return NextResponse.json({ error: "找不到這筆陪跑" }, { status: 404 });
      }
    }

    const snapshot = buildGo21CoachPlanSnapshot({
      items: body.items ?? [],
      source: body.source === "activation" ? "activation" : "coach_edit",
      effectiveFrom: body.effectiveFrom ?? coachingTodayLogDate(),
    });
    const prior = await loadGo21CoachPlanRecord(enrollmentId);
    const record = await saveGo21CoachPlan({
      enrollmentId,
      customerId,
      ownerMemberId: memberId,
      snapshot,
      reason: body.source === "activation" ? "activation" : "coach_edit",
      prior,
    });
    return NextResponse.json({
      ok: true,
      enrollmentId,
      plan: toGo21CoachPlanPublicView(record),
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法儲存每日安排");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
