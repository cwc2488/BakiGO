import { NextResponse } from "next/server";
import { AnalysisSessionError, requireAnalysisSessionRowByToken } from "@/lib/analysis/analysis-session-service";
import { canonicalResultShareHref } from "@/lib/quiz/viral/quiz-result-share-codes";
import {
  getOrCreateResultShareForSession,
  publicResultSharePayload,
} from "@/lib/quiz/viral/quiz-result-share-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Analysis service unavailable." }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  try {
    const row = await requireAnalysisSessionRowByToken(String(body.token ?? ""));
    const share = await getOrCreateResultShareForSession({
      analysisSessionId: row.id,
      answersJson: (row.answers_json as Record<string, unknown> | null) ?? null,
    });
    return NextResponse.json({
      ok: true,
      ...publicResultSharePayload(share),
      href: canonicalResultShareHref(share.code),
    });
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create result share." }, { status: 500 });
  }
}
