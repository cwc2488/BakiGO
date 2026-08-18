import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  reorderEventAwards,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
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
    const { eventId } = await context.params;

    const body = (await request.json()) as { orderedAwardIds?: unknown };

    if (!Array.isArray(body.orderedAwardIds)) {
      return NextResponse.json({ error: "orderedAwardIds must be an array." }, { status: 400 });
    }

    const ids = body.orderedAwardIds as unknown[];
    if (!ids.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "orderedAwardIds must be an array of strings." }, { status: 400 });
    }

    await reorderEventAwards(eventId, ids as string[]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reorder awards.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
