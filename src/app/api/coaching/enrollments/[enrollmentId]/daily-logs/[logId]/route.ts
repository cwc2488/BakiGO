import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { softDeleteCoachingDailyLogForCoach } from "@/lib/coaching/coaching-daily-log-delete";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ enrollmentId: string; logId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId, logId } = await context.params;
    const deleted = await softDeleteCoachingDailyLogForCoach({
      enrollmentId,
      logId,
      ownerMemberId: memberId,
    });
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to delete coaching record.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
