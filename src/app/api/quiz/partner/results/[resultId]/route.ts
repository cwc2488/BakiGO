import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { getQuizResultById, serializePartnerResult } from "@/lib/quiz/quiz-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ resultId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Quiz service unavailable." }, { status: 503 });
  }

  const { resultId } = await context.params;
  try {
    const record = await getQuizResultById(resultId);
    if (!record) {
      return NextResponse.json({ error: "Result not found." }, { status: 404 });
    }
    if (record.referrerMemberId !== memberId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, intelligence: serializePartnerResult(record) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load intelligence card." },
      { status: 400 },
    );
  }
}
