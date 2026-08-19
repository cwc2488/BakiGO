import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { getOrCreatePermanentShareLink } from "@/lib/quiz/quiz-service";
import {
  canonicalQuizShareDisplay,
  canonicalQuizShareHref,
} from "@/lib/quiz/partner/quiz-partner-presentation";
import { toQuizApiErrorMessage } from "@/lib/quiz/quiz-api-error";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Quiz service unavailable." }, { status: 503 });
  }
  try {
    const link = await getOrCreatePermanentShareLink(memberId);
    return NextResponse.json({
      ok: true,
      shareCode: link.shareCode,
      path: link.url,
      href: canonicalQuizShareHref(link.shareCode),
      display: canonicalQuizShareDisplay(link.shareCode),
    });
  } catch (error) {
    return NextResponse.json(
      { error: toQuizApiErrorMessage(error, "Failed to load share link.") },
      { status: 400 },
    );
  }
}
