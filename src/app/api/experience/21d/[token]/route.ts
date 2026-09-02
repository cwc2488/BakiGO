import { NextResponse } from "next/server";
import { AnalysisSessionError } from "@/lib/analysis/analysis-session-service";
import {
  loadExperience21dLandingContext,
  submitExperience21dConsultation,
} from "@/lib/experience/experience-21d-landing-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Ctx) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const contextPayload = await loadExperience21dLandingContext(token);
    return NextResponse.json({ ok: true, ...contextPayload });
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
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const body = (await request.json()) as {
      consultationPreference?: string;
      displayName?: string;
      channel?: string;
      value?: string;
      ownerMemberId?: string;
      growthShareId?: string;
      referrerMemberId?: string;
    };

    if (body.ownerMemberId != null || body.growthShareId != null || body.referrerMemberId != null) {
      return NextResponse.json(
        { error: "Invalid attribution payload.", code: "forged_share_id" },
        { status: 400 },
      );
    }

    const result = await submitExperience21dConsultation({
      token,
      consultationPreference: body.consultationPreference,
      displayName: body.displayName,
      channel: body.channel,
      value: body.value,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit." },
      { status: 500 },
    );
  }
}
