import { NextResponse } from "next/server";
import { AnalysisSessionError, requireAnalysisSessionRowByToken } from "@/lib/analysis/analysis-session-service";
import {
  RESULT_SHARE_EVENTS,
  getOrCreateResultShareForSession,
  recordResultShareEvent,
  type ResultShareEvent,
} from "@/lib/quiz/viral/quiz-result-share-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: true, recorded: false });
  }
  const body = (await request.json().catch(() => ({}))) as { token?: string; event?: string };
  const event = String(body.event ?? "") as ResultShareEvent;
  if (!RESULT_SHARE_EVENTS.includes(event)) {
    return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  }
  try {
    const row = await requireAnalysisSessionRowByToken(String(body.token ?? ""));
    const share = await getOrCreateResultShareForSession({
      analysisSessionId: row.id,
      answersJson: (row.answers_json as Record<string, unknown> | null) ?? null,
    });
    const recorded = await recordResultShareEvent({
      resultShareId: share.id,
      analysisSessionId: row.id,
      event,
    });
    return NextResponse.json({ ok: true, recorded: recorded.recorded, event });
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: true, recorded: false });
  }
}
