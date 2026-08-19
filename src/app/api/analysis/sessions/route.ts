import { NextResponse } from "next/server";
import {
  AnalysisSessionError,
  createAnalysisSession,
  createNativeAnalysisSession,
} from "@/lib/analysis/analysis-session-service";
import { startAnalysisIntake } from "@/lib/analysis/analysis-intake-service";
import { isProductionRuntime } from "@/lib/analysis/interview/native/native-path";
import { createResetPreviewSession } from "@/lib/analysis/reset/reset-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Analysis service unavailable." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      quizResultId?: string;
      referralShareToken?: string | null;
      radarCandidateId?: string | null;
      entry?: string | null;
      /** Opaque /q code only. Never a member UUID ownership claim. */
      shareCode?: string | null;
      /** Opaque /s result-share code. Never a Partner /q code. */
      resultShareCode?: string | null;
      /** Rejected: clients must not send share UUIDs as ownership claims. */
      growthShareId?: unknown;
      shareId?: unknown;
    };

    if (body.growthShareId != null || body.shareId != null) {
      return NextResponse.json(
        { error: "Invalid attribution payload.", code: "forged_share_id" },
        { status: 400 },
      );
    }

    if (body.entry === "reset_v1") {
      const created = await createResetPreviewSession({
        referralShareToken: body.referralShareToken,
        radarCandidateId: body.radarCandidateId,
        shareCode: body.shareCode,
        resultShareCode: body.resultShareCode,
      });
      return NextResponse.json({
        ok: true,
        token: created.token,
        expiresAt: created.expiresAt,
        analysisState: "questions_in_progress",
        entry: "reset_v1",
      });
    }

    if (body.entry === "native_v1") {
      if (isProductionRuntime()) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      const created = await createNativeAnalysisSession({
        referralShareToken: body.referralShareToken,
        radarCandidateId: body.radarCandidateId,
      });
      await startAnalysisIntake(created.plaintextToken, {
        analysisPath: "native_v1",
        interviewPath: request.headers.get("x-baki-interview-path"),
        interviewModel: request.headers.get("x-baki-interview-model"),
        quizModel: request.headers.get("x-baki-quiz-model"),
      });
      return NextResponse.json({
        ok: true,
        token: created.plaintextToken,
        expiresAt: created.session.expiresAt,
        analysisState: "questions_in_progress",
        sourceType: created.session.sourceType,
        entry: "native_v1",
      });
    }

    if (!body.quizResultId?.trim()) {
      return NextResponse.json({ error: "quizResultId is required." }, { status: 400 });
    }

    const created = await createAnalysisSession({
      quizResultId: body.quizResultId.trim(),
      referralShareToken: body.referralShareToken,
      radarCandidateId: body.radarCandidateId,
    });

    return NextResponse.json({
      ok: true,
      token: created.plaintextToken,
      expiresAt: created.session.expiresAt,
      analysisState: created.session.analysisState,
      sourceType: created.session.sourceType,
    });
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create analysis session." },
      { status: 500 },
    );
  }
}
