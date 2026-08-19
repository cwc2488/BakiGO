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
      referralShareToken?: string | null;
      /** Rejected: clients must not claim growth share UUID ownership. */
      growthShareId?: unknown;
      shareId?: unknown;
    };

    if (body.growthShareId != null || body.shareId != null) {
      return NextResponse.json(
        { error: "Invalid attribution payload.", code: "forged_share_id" },
        { status: 400 },
      );
    }

    if (!body.respondentName?.trim()) {
      return NextResponse.json({ error: "Respondent name is required." }, { status: 400 });
    }

    const response = await createQuizResponse({
      respondentName: body.respondentName,
      shareCode: body.shareCode,
      referrerMemberId: body.referrerMemberId,
      referralShareToken: body.referralShareToken,
    });

    return NextResponse.json({ ok: true, responseId: response.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start quiz." },
      { status: 400 },
    );
  }
}
