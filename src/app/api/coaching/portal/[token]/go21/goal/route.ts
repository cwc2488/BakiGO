import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { requireGo21Portal } from "@/lib/go21/go21-portal";
import {
  assessGo21GoalSafety,
  buildGo21GoalSnapshot,
  enrollmentNeedsGo21Goal,
  loadGo21GoalRecord,
  saveGo21Goal,
  toGo21GoalPublicView,
  isGo21PrimaryDirection,
} from "@/lib/go21/goal";

export const runtime = "nodejs";

/**
 * GET current 21-day goal for this portal (customer-scoped).
 * POST set/refine goal — never trusts client customer/enrollment IDs.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const { portal, enrollment } = await requireGo21Portal(token);
    const record = await loadGo21GoalRecord(portal.enrollmentId);
    return NextResponse.json({
      ok: true,
      goal: toGo21GoalPublicView(record),
      needsGoal: enrollmentNeedsGo21Goal({
        go21GoalJson: (enrollment as { go21_goal_json?: unknown }).go21_goal_json ?? record,
        goal: enrollment.goal,
      }),
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法載入目標");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const { portal } = await requireGo21Portal(token);
    const body = (await request.json()) as {
      primaryDirection?: string;
      personalGoal?: string;
      targetWeightKg?: number | null;
      source?: "onboarding" | "chat_confirmed" | "ui_edit";
      confirmUnsafe?: boolean;
    };

    if (!isGo21PrimaryDirection(body.primaryDirection)) {
      return NextResponse.json({ error: "請選擇一個主要方向。" }, { status: 400 });
    }
    const personalGoal = body.personalGoal?.trim() ?? "";
    if (personalGoal.length < 2) {
      return NextResponse.json(
        { error: "請用一句話告訴我，21 天後你最希望有什麼改變。" },
        { status: 400 },
      );
    }

    const snapshot = buildGo21GoalSnapshot({
      primaryDirection: body.primaryDirection,
      personalGoal,
      targetWeightKg: body.targetWeightKg ?? null,
      source: body.source ?? "onboarding",
    });

    const safety = assessGo21GoalSafety({
      personalGoal: snapshot.personalGoal,
      targetWeightKg: snapshot.targetWeightKg,
    });
    if (!safety.ok && !body.confirmUnsafe) {
      return NextResponse.json(
        {
          ok: false,
          error: safety.message ?? "這個目標不太適合硬衝。",
          safety,
        },
        { status: 422 },
      );
    }

    const saved = await saveGo21Goal({
      enrollmentId: portal.enrollmentId,
      customerId: portal.customerId,
      ownerMemberId: portal.ownerMemberId,
      snapshot,
      reason: body.source === "onboarding" ? "onboarding" : "customer_update",
    });

    if (!saved.safety.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: saved.safety.message,
          safety: saved.safety,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      goal: toGo21GoalPublicView(saved.record),
      safety: saved.safety,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法儲存目標");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
