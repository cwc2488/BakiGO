import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import { getRecognitionCandidatePhotoObject } from "@/lib/recognition/recognition-candidate-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; candidateId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId, candidateId } = await context.params;
    const sourceEntryId = new URL(request.url).searchParams.get("sourceEntryId");
    if (!sourceEntryId) {
      return NextResponse.json({ error: "sourceEntryId is required." }, { status: 400 });
    }
    const photo = await getRecognitionCandidatePhotoObject({
      eventId,
      candidateId,
      sourceEntryId,
    });
    return new NextResponse(Buffer.from(photo.body), {
      status: 200,
      headers: {
        "Content-Type": photo.mimeType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load photo.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
