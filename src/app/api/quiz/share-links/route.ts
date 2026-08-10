import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { listShareLinksForMember } from "@/lib/quiz/quiz-service";
import { toQuizApiErrorMessage } from "@/lib/quiz/quiz-api-error";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Quiz service unavailable." }, { status: 503 });
  }

  try {
    const links = await listShareLinksForMember(memberId);
    return NextResponse.json({ ok: true, links });
  } catch (error) {
    return NextResponse.json(
      { error: toQuizApiErrorMessage(error, "Failed to load share links.") },
      { status: 400 },
    );
  }
}
