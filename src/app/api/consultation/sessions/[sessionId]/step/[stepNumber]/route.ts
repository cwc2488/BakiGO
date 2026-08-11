import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  completeConsultationStep1,
  completeConsultationStep3,
  getConsultationSession,
  saveConsultationStep2,
  serializeConsultationSession,
} from "@/lib/consultation/consultation-service";
import { toConsultationApiErrorMessage } from "@/lib/consultation/consultation-api-error";
import { isPhase1Step, isValidConsultationStep } from "@/lib/consultation/consultation-flow-engine";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type { ConsultationHealthData } from "@/types/consultation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string; stepNumber: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Consultation service unavailable." }, { status: 503 });
  }

  try {
    const { sessionId, stepNumber: stepNumberRaw } = await context.params;
    const stepNumber = Number(stepNumberRaw);
    if (!isValidConsultationStep(stepNumber) || !isPhase1Step(stepNumber)) {
      return NextResponse.json({ error: "Invalid step number for Phase 1." }, { status: 400 });
    }

    const body = (await request.json()) as {
      health?: Partial<ConsultationHealthData>;
      bodyCompositionRecordId?: string;
    };

    let record;
    if (stepNumber === 1) {
      record = await completeConsultationStep1({
        sessionId,
        memberId,
      });
    } else if (stepNumber === 2) {
      record = await saveConsultationStep2({
        sessionId,
        memberId,
        health: body.health ?? {},
      });
    } else if (stepNumber === 3) {
      if (!body.bodyCompositionRecordId?.trim()) {
        return NextResponse.json({ error: "bodyCompositionRecordId is required." }, { status: 400 });
      }
      record = await completeConsultationStep3({
        sessionId,
        memberId,
        bodyCompositionRecordId: body.bodyCompositionRecordId.trim(),
      });
    } else {
      return NextResponse.json({ error: "Step not implemented." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      ...serializeConsultationSession(record),
    });
  } catch (error) {
    const message = toConsultationApiErrorMessage(error, "Failed to save consultation step.");
    const status = message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Consultation service unavailable." }, { status: 503 });
  }

  try {
    const { sessionId } = await context.params;
    const record = await getConsultationSession({ sessionId, memberId });
    return NextResponse.json({
      ok: true,
      ...serializeConsultationSession(record),
    });
  } catch (error) {
    const message = toConsultationApiErrorMessage(error, "Failed to load consultation session.");
    const status = message === "Forbidden" ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
