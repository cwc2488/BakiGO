import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  completeCoachingOnboarding,
  resolveActiveCoachingPortal,
} from "@/lib/coaching/coaching-service";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    await completeCoachingOnboarding(portal.enrollmentId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to complete onboarding.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
