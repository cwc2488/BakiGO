import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  createCoachingEnrollment,
  getActiveEnrollmentForCustomer,
  serializeCoachingEnrollment,
} from "@/lib/coaching/coaching-service";
import { parseCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";

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
    const customerId = url.searchParams.get("customerId")?.trim();
    if (!customerId) {
      return NextResponse.json({ error: "customerId is required." }, { status: 400 });
    }

    const enrollment = await getActiveEnrollmentForCustomer({
      customerId,
      ownerMemberId: memberId,
    });

    return NextResponse.json({
      ok: true,
      enrollment: enrollment ? serializeCoachingEnrollment(enrollment) : null,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load coaching enrollment.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      customerId?: string;
      goal?: string | null;
      planSnapshot?: unknown;
    };
    if (!body.customerId?.trim()) {
      return NextResponse.json({ error: "customerId is required." }, { status: 400 });
    }

    const enrollment = await createCoachingEnrollment({
      customerId: body.customerId.trim(),
      ownerMemberId: memberId,
      goal: body.goal ?? null,
      planSnapshot: body.planSnapshot ? parseCoachingPlanSnapshot(body.planSnapshot) : undefined,
    });

    return NextResponse.json({
      ok: true,
      enrollment: serializeCoachingEnrollment(enrollment),
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to create coaching enrollment.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
