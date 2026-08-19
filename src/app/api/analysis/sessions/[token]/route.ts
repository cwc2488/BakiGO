import { NextResponse } from "next/server";
import {
  AnalysisSessionError,
  getAnalysisSessionByToken,
} from "@/lib/analysis/analysis-session-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Analysis service unavailable." }, { status: 503 });
  }

  try {
    const { token } = await context.params;
    const view = await getAnalysisSessionByToken(token);
    return NextResponse.json({ ok: true, session: view });
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load analysis session." },
      { status: 500 },
    );
  }
}
