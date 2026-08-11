import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  completeConsultationStep1,
  completeConsultationStep3,
  completeConsultationStep8,
  getConsultationSession,
  saveConsultationStep2,
  saveConsultationStep4,
  saveConsultationStep5,
  saveConsultationStep6,
  saveConsultationStep7,
  serializeConsultationSession,
} from "@/lib/consultation/consultation-service";
import { toConsultationApiErrorMessage } from "@/lib/consultation/consultation-api-error";
import { isValidConsultationStep } from "@/lib/consultation/consultation-flow-engine";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type {
  ConsultationBarriersData,
  ConsultationGoalsData,
  ConsultationHealthData,
  ConsultationMotivationsData,
  ConsultationPreviousExperienceData,
  ConsultationReadinessData,
} from "@/types/consultation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string; stepNumber: string }>;
};

type StepPatchBody = {
  health?: Partial<ConsultationHealthData>;
  bodyCompositionRecordId?: string;
  goals?: Partial<ConsultationGoalsData>;
  previousExperience?: Partial<ConsultationPreviousExperienceData>;
  motivations?: Partial<ConsultationMotivationsData>;
  commitmentScore?: number;
  barriers?: Partial<ConsultationBarriersData>;
  readiness?: Partial<ConsultationReadinessData>;
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
    if (!isValidConsultationStep(stepNumber) || stepNumber > 8) {
      return NextResponse.json({ error: "Invalid or unsupported step number." }, { status: 400 });
    }

    const body = (await request.json()) as StepPatchBody;

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
    } else if (stepNumber === 4) {
      record = await saveConsultationStep4({
        sessionId,
        memberId,
        goals: body.goals ?? {},
      });
    } else if (stepNumber === 5) {
      record = await saveConsultationStep5({
        sessionId,
        memberId,
        previousExperience: body.previousExperience ?? {},
      });
    } else if (stepNumber === 6) {
      record = await saveConsultationStep6({
        sessionId,
        memberId,
        motivations: body.motivations ?? {},
      });
    } else if (stepNumber === 7) {
      if (body.commitmentScore === undefined) {
        return NextResponse.json({ error: "commitmentScore is required." }, { status: 400 });
      }
      record = await saveConsultationStep7({
        sessionId,
        memberId,
        commitmentScore: body.commitmentScore,
      });
    } else if (stepNumber === 8) {
      record = await completeConsultationStep8({
        sessionId,
        memberId,
        barriers: body.barriers ?? {},
        readiness: body.readiness ?? {},
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
