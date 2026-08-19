import { NextResponse } from "next/server";
import {
  getAnalysisFlowView,
  startAnalysisIntake,
  submitAnalysisAnswer,
} from "@/lib/analysis/analysis-intake-service";
import { AnalysisSessionError } from "@/lib/analysis/analysis-session-service";
import { kickAnalysisGenerationWorkerBestEffort } from "@/lib/analysis/kick-analysis-generation-worker";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Ctx) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Analysis service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const view = await getAnalysisFlowView(token);
    // Safety net: reopen while generating
    if (view.analysisState === "ai_generating" || view.analysisState === "basic_report_ready") {
      kickAnalysisGenerationWorkerBestEffort({ source: "flow_get_reopen" });
    }
    return NextResponse.json({ ok: true, flow: view });
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load analysis flow." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Ctx) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Analysis service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      questionId?: string;
      value?: unknown;
    };

    if (body.action === "start") {
      const flow = await startAnalysisIntake(token, {
        interviewPath: request.headers.get("x-baki-interview-path"),
        interviewModel: request.headers.get("x-baki-interview-model"),
        analysisPath: request.headers.get("x-baki-analysis-path"),
        quizModel: request.headers.get("x-baki-quiz-model"),
      });
      return NextResponse.json({ ok: true, flow });
    }

    if (body.action === "answer") {
      if (!body.questionId) {
        return NextResponse.json({ error: "questionId is required." }, { status: 400 });
      }
      const flow = await submitAnalysisAnswer({
        token,
        questionId: body.questionId,
        value: body.value,
      });
      const timings = "timings" in flow ? flow.timings : undefined;
      const interviewDebug = "interviewDebug" in flow ? flow.interviewDebug : undefined;
      return NextResponse.json({ ok: true, flow, timings, interviewDebug });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update analysis flow." },
      { status: 500 },
    );
  }
}
