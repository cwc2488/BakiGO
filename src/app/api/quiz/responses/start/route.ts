import { NextResponse } from "next/server";
import { createQuizResponse } from "@/lib/quiz/quiz-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Quiz service unavailable." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      respondentName?: string;
      shareCode?: string;
      referrerMemberId?: string;
    };

    if (!body.respondentName?.trim()) {
      return NextResponse.json({ error: "Respondent name is required." }, { status: 400 });
    }

    const response = await createQuizResponse({
      respondentName: body.respondentName,
      shareCode: body.shareCode,
      referrerMemberId: body.referrerMemberId,
    });

    return NextResponse.json({ ok: true, responseId: response.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start quiz." },
      { status: 400 },
    );
  }
}
