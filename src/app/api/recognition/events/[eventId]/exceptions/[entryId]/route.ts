import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  assertRecognitionAdmin,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import {
  adminExcludeRecognitionEntry,
  adminOverrideRecognitionEntry,
} from "@/lib/recognition/recognition-validation-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; entryId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }
  try {
    await assertRecognitionAdmin(memberId);
    const { eventId, entryId } = await context.params;
    const body = await request.json() as { action?: string; reason?: string | null };
    if (body.action === "override") {
      const result = await adminOverrideRecognitionEntry({
        eventId,
        entryId,
        adminMemberId: memberId,
        reason: body.reason,
      });
      return NextResponse.json({ ok: true, status: result.status });
    }
    if (body.action === "exclude") {
      const result = await adminExcludeRecognitionEntry({
        eventId,
        entryId,
        adminMemberId: memberId,
        reason: body.reason,
      });
      return NextResponse.json({ ok: true, status: result.status });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update exception.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
