import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  getCoachingEnrollmentForCoach,
} from "@/lib/coaching/coaching-service";
import {
  createCoachDirective,
  listCoachDirectivesForEnrollment,
  updateCoachDirective,
} from "@/lib/coaching/coach-directives/coach-directive-service";
import { DIRECTIVE_MEAL_SLOTS, type DirectiveMealSlot } from "@/lib/coaching/directive-meal-verification";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    await getCoachingEnrollmentForCoach({ enrollmentId, ownerMemberId: memberId });
    const directives = await listCoachDirectivesForEnrollment({
      enrollmentId,
      ownerMemberId: memberId,
    });
    return NextResponse.json({ ok: true, directives });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load directives.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    const enrollment = await getCoachingEnrollmentForCoach({
      enrollmentId,
      ownerMemberId: memberId,
    });
    const body = (await request.json()) as {
      mealSlot?: string;
      instructionText?: string;
      effectiveFrom?: string;
      effectiveUntil?: string | null;
      customerVisible?: boolean;
    };
    const mealSlot = body.mealSlot ?? "general";
    if (!(DIRECTIVE_MEAL_SLOTS as readonly string[]).includes(mealSlot)) {
      return NextResponse.json({ error: "mealSlot invalid" }, { status: 400 });
    }
    if (!body.instructionText?.trim() || !body.effectiveFrom) {
      return NextResponse.json({ error: "instructionText and effectiveFrom required" }, { status: 400 });
    }
    const directive = await createCoachDirective({
      enrollmentId,
      customerId: enrollment.customerId,
      ownerMemberId: memberId,
      mealSlot: mealSlot as DirectiveMealSlot,
      instructionText: body.instructionText,
      effectiveFrom: body.effectiveFrom,
      effectiveUntil: body.effectiveUntil ?? null,
      customerVisible: body.customerVisible,
    });
    return NextResponse.json({ ok: true, directive });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to create directive.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    await getCoachingEnrollmentForCoach({ enrollmentId, ownerMemberId: memberId });
    const body = (await request.json()) as {
      directiveId?: string;
      mealSlot?: DirectiveMealSlot;
      instructionText?: string;
      effectiveFrom?: string;
      effectiveUntil?: string | null;
      status?: "active" | "paused" | "completed";
      customerVisible?: boolean;
    };
    if (!body.directiveId) {
      return NextResponse.json({ error: "directiveId required" }, { status: 400 });
    }
    const directive = await updateCoachDirective({
      directiveId: body.directiveId,
      ownerMemberId: memberId,
      mealSlot: body.mealSlot,
      instructionText: body.instructionText,
      effectiveFrom: body.effectiveFrom,
      effectiveUntil: body.effectiveUntil,
      status: body.status,
      customerVisible: body.customerVisible,
    });
    return NextResponse.json({ ok: true, directive });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to update directive.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
