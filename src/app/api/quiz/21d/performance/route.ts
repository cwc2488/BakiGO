import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { getPartnerQuizFunnel } from "@/lib/quiz/partner/quiz-partner-funnel";
import type { QuizPartnerRange } from "@/lib/quiz/partner/quiz-partner-presentation";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  const rangeParam = new URL(request.url).searchParams.get("range");
  const range: QuizPartnerRange =
    rangeParam === "7d" || rangeParam === "all" || rangeParam === "month" ? rangeParam : "month";
  const funnel = await getPartnerQuizFunnel(memberId, range);
  return NextResponse.json({ ok: true, funnel });
}
