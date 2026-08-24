import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import { syncRecognitionEventCandidates } from "@/lib/recognition/recognition-candidate-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId } = await context.params;
    const result = await syncRecognitionEventCandidates(eventId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync candidates.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
