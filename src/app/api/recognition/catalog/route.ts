import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { listAwardDefinitions, RecognitionServiceError } from "@/lib/recognition/recognition-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    const awards = await listAwardDefinitions();
    return NextResponse.json({ ok: true, awards });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load catalog.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
