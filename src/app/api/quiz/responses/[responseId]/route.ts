import { NextResponse } from "next/server";
import { updateQuizResponseAnswers } from "@/lib/quiz/quiz-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type { FatLossQuizAnswers } from "@/lib/quiz/fat-loss/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ responseId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Quiz service unavailable." }, { status: 503 });
  }

  const { responseId } = await context.params;
  try {
    const body = (await request.json()) as { answers?: FatLossQuizAnswers };
    if (!body.answers) {
      return NextResponse.json({ error: "Answers are required." }, { status: 400 });
    }
    await updateQuizResponseAnswers(responseId, body.answers);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save answers." },
      { status: 400 },
    );
  }
}
