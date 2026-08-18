import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { isRecognitionAdmin, RecognitionServiceError } from "@/lib/recognition/recognition-service";

export const runtime = "nodejs";

/** Returns 200 if current user is a Recognition Admin, 403 otherwise. */
export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    const admin = await isRecognitionAdmin(memberId);
    if (!admin) {
      return NextResponse.json({ error: "Not a Recognition Admin." }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check admin status.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
