import { NextResponse } from "next/server";
import { getQuizResultById, serializePublicResult } from "@/lib/quiz/quiz-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ resultId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Quiz service unavailable." }, { status: 503 });
  }

  const { resultId } = await context.params;
  try {
    const record = await getQuizResultById(resultId);
    if (!record) {
      return NextResponse.json({ error: "Result not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, result: serializePublicResult(record) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load result." },
      { status: 400 },
    );
  }
}
