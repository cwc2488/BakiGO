import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { updateCoachingCoachAction } from "@/lib/coaching/coach-actions/coaching-coach-action-service";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  isCoachingCoachActionStatus,
  type CoachingCoachActionStatus,
} from "@/types/coaching-coach-actions";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ enrollmentId: string; actionId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId, actionId } = await context.params;
    const body = (await request.json()) as {
      status?: string;
      note?: string | null;
      resolve?: boolean;
    };

    let status: CoachingCoachActionStatus | undefined;
    if (body.status != null) {
      if (!isCoachingCoachActionStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      status = body.status;
    }

    const action = await updateCoachingCoachAction({
      actionId,
      enrollmentId,
      ownerMemberId: memberId,
      status,
      note: body.note,
      resolve: body.resolve === true,
    });

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to update coach action.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
