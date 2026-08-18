import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  updateEventAward,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string; awardId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId, awardId } = await context.params;

    const body = (await request.json()) as {
      isEnabled?: boolean;
      sortOrder?: number;
    };

    const award = await updateEventAward(eventId, awardId, {
      isEnabled: body.isEnabled,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json({ ok: true, award });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update event award.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
