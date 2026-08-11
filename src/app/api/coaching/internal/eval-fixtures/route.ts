import { isCoachingAiEvalAuthorized } from "@/lib/coaching/ai/coaching-ai-eval-auth";
import { runCoachingAiControlledEvaluation } from "@/lib/coaching/ai/run-coaching-ai-evaluation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Temporary internal route for controlled synthetic AI evaluation. Remove after Phase 2b-5. */
export async function POST(request: Request) {
  if (!isCoachingAiEvalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: "OPENAI_API_KEY unavailable on server" }, { status: 503 });
  }

  try {
    const report = await runCoachingAiControlledEvaluation();
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "evaluation_failed",
      },
      { status: 500 },
    );
  }
}
