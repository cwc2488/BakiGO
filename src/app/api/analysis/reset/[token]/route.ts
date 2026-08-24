import { NextResponse } from "next/server";
import { AnalysisSessionError } from "@/lib/analysis/analysis-session-service";
import { isResetPreviewAllowed } from "@/lib/analysis/reset/reset-path";
import {
  getResetExperience,
  startResetConversation,
  submitResetConversationAnswer,
  submitResetQuizAnswer,
  submitReset21dInterest,
} from "@/lib/analysis/reset/reset-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Ctx) {
  if (!isResetPreviewAllowed()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Analysis service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const result = await getResetExperience(token);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Ctx) {
  if (!isResetPreviewAllowed()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Analysis service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      questionId?: string;
      optionId?: string;
      value?: string;
      displayName?: string;
      channel?: string;
    };
    if (body.action === "quiz_answer") {
      if (!body.questionId || !body.optionId) {
        return NextResponse.json({ error: "questionId and optionId required." }, { status: 400 });
      }
      const experience = await submitResetQuizAnswer({
        token,
        questionId: body.questionId,
        optionId: body.optionId,
      });
      return NextResponse.json({ ok: true, kind: "reset", experience });
    }
    if (body.action === "start_conversation") {
      const experience = await startResetConversation(token);
      return NextResponse.json({ ok: true, kind: "reset", experience });
    }
    if (body.action === "chat") {
      const experience = await submitResetConversationAnswer({
        token,
        value: String(body.value ?? ""),
      });
      return NextResponse.json({ ok: true, kind: "reset", experience });
    }
    if (body.action === "21d_interest") {
      const experience = await submitReset21dInterest({
        token,
        displayName: body.displayName,
        channel: body.channel,
        value: body.value,
      });
      return NextResponse.json({ ok: true, kind: "reset", experience });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update." },
      { status: 500 },
    );
  }
}
