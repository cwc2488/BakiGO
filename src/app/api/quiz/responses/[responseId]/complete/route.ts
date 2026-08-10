import { NextResponse } from "next/server";
import { completeQuizResponse, serializePublicResult } from "@/lib/quiz/quiz-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ responseId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Quiz service unavailable." }, { status: 503 });
  }

  const { responseId } = await context.params;
  try {
    const record = await completeQuizResponse(responseId);
    return NextResponse.json({
      ok: true,
      resultId: record.resultId,
      result: serializePublicResult(record),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete quiz." },
      { status: 400 },
    );
  }
}
