import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  listRecognitionRawSubmissions,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";

export const runtime = "nodejs";

export async function GET(
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
    const submissions = await listRecognitionRawSubmissions(eventId);
    const totalEntries = submissions.reduce((sum, item) => sum + item.entries.length, 0);
    return NextResponse.json({
      ok: true,
      totalSubmissions: submissions.length,
      totalEntries,
      submissions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load raw submissions.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
