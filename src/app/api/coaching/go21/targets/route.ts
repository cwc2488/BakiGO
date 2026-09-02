import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured, createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  getActiveEnrollmentForCustomer,
} from "@/lib/coaching/coaching-service";
import { isExperience21dEnrollment } from "@/lib/coaching/experience-21d";
import { GO21_DAILY_TARGET_PRESETS } from "@/types/go21";
import {
  buildGo21DailyTargetsSnapshot,
  loadGo21DailyTargetsRecord,
  parseGo21DailyTargetsRecord,
  saveGo21DailyTargets,
  toGo21DailyTargetsPublicView,
} from "@/lib/go21/daily-targets";
import { loadGo21TodayDailyState } from "@/lib/go21/load-daily-state";

export const runtime = "nodejs";

/**
 * Coach-facing daily targets GET/POST for an owned Go21 enrollment.
 * Query: ?customerId=
 */
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
    const record = await loadGo21DailyTargetsRecord(enrollment.id);
    const loaded = await loadGo21TodayDailyState({
      enrollmentId: enrollment.id,
      targetsJson: record,
    });
    return NextResponse.json({
      ok: true,
      enrollmentId: enrollment.id,
      targets: loaded.targets,
      dailyState: loaded.dailyState,
      presets: GO21_DAILY_TARGET_PRESETS,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法載入每日目標");
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
      waterMl?: number | null;
      caloriesKcal?: number | null;
      proteinG?: number | null;
      sleepHours?: number | null;
      source?: "activation" | "coach_edit";
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

    const snapshot = buildGo21DailyTargetsSnapshot({
      waterMl: body.waterMl,
      caloriesKcal: body.caloriesKcal,
      proteinG: body.proteinG,
      sleepHours: body.sleepHours,
      source: body.source === "activation" ? "activation" : "coach_edit",
    });
    const prior = await loadGo21DailyTargetsRecord(enrollmentId);
    const record = await saveGo21DailyTargets({
      enrollmentId,
      customerId,
      ownerMemberId: memberId,
      snapshot,
      reason: body.source === "activation" ? "activation" : "coach_edit",
      prior: prior ?? parseGo21DailyTargetsRecord(null),
    });
    const loaded = await loadGo21TodayDailyState({
      enrollmentId,
      targetsJson: record,
    });
    return NextResponse.json({
      ok: true,
      enrollmentId,
      targets: toGo21DailyTargetsPublicView(record),
      dailyState: loaded.dailyState,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法儲存每日目標");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
