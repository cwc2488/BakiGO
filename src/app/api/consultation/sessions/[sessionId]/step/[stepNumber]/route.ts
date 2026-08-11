import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  completeConsultationStep1,
  completeConsultationStep14,
  completeConsultationStep3,
  completeConsultationStep8,
  getConsultationSession,
  saveConsultationStep2,
  saveConsultationStep4,
  saveConsultationStep5,
  saveConsultationStep6,
  saveConsultationStep7,
  saveConsultationStep9,
  saveConsultationStep10,
  saveConsultationStep11,
  saveConsultationStep12,
  saveConsultationStep13,
  serializeConsultationSession,
} from "@/lib/consultation/consultation-service";
import { toConsultationApiErrorMessage } from "@/lib/consultation/consultation-api-error";
import { isValidConsultationStep } from "@/lib/consultation/consultation-flow-engine";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type {
  ConsultationBarriersData,
  ConsultationCooperationData,
  ConsultationGoalsData,
  ConsultationHealthData,
  ConsultationMealsData,
  ConsultationMethodInterest,
  ConsultationMotivationsData,
  ConsultationOutcomeData,
  ConsultationPreviousExperienceData,
  ConsultationReadinessData,
  ConsultationServicesData,
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
  storyAction?: "increment" | "decrement" | "complete";
  interest?: ConsultationMethodInterest;
  methodInterestNotes?: string;
  educationAcknowledged?: boolean;
  cooperation?: Partial<ConsultationCooperationData>;
  meals?: Partial<ConsultationMealsData>;
  services?: Partial<ConsultationServicesData>;
  outcome?: Partial<ConsultationOutcomeData>;
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
    if (!isValidConsultationStep(stepNumber)) {
      return NextResponse.json({ error: "Invalid or unsupported step number." }, { status: 400 });
    }

    const body = (await request.json()) as StepPatchBody;

    if (stepNumber === 1) {
      const record = await completeConsultationStep1({ sessionId, memberId });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 2) {
      const record = await saveConsultationStep2({ sessionId, memberId, health: body.health ?? {} });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 3) {
      if (!body.bodyCompositionRecordId?.trim()) {
        return NextResponse.json({ error: "bodyCompositionRecordId is required." }, { status: 400 });
      }
      const record = await completeConsultationStep3({
        sessionId,
        memberId,
        bodyCompositionRecordId: body.bodyCompositionRecordId.trim(),
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 4) {
      const record = await saveConsultationStep4({ sessionId, memberId, goals: body.goals ?? {} });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 5) {
      const record = await saveConsultationStep5({
        sessionId,
        memberId,
        previousExperience: body.previousExperience ?? {},
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 6) {
      const record = await saveConsultationStep6({
        sessionId,
        memberId,
        motivations: body.motivations ?? {},
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 7) {
      if (body.commitmentScore === undefined) {
        return NextResponse.json({ error: "commitmentScore is required." }, { status: 400 });
      }
      const record = await saveConsultationStep7({
        sessionId,
        memberId,
        commitmentScore: body.commitmentScore,
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 8) {
      const record = await completeConsultationStep8({
        sessionId,
        memberId,
        barriers: body.barriers ?? {},
        readiness: body.readiness ?? {},
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 9) {
      if (!body.storyAction) {
        return NextResponse.json({ error: "storyAction is required." }, { status: 400 });
      }
      const record = await saveConsultationStep9({
        sessionId,
        memberId,
        storyAction: body.storyAction,
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 10) {
      if (!body.interest) {
        return NextResponse.json({ error: "interest is required." }, { status: 400 });
      }
      const record = await saveConsultationStep10({
        sessionId,
        memberId,
        interest: body.interest,
        notes: body.methodInterestNotes,
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 11) {
      const record = await saveConsultationStep11({
        sessionId,
        memberId,
        acknowledged: body.educationAcknowledged === true,
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 12) {
      const record = await saveConsultationStep12({
        sessionId,
        memberId,
        cooperation: body.cooperation ?? {},
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 13) {
      const record = await saveConsultationStep13({
        sessionId,
        memberId,
        meals: body.meals ?? {},
        services: body.services ?? {},
      });
      return NextResponse.json({ ok: true, ...serializeConsultationSession(record) });
    }
    if (stepNumber === 14) {
      const result = await completeConsultationStep14({
        sessionId,
        memberId,
        outcome: body.outcome ?? {},
      });
      return NextResponse.json({
        ok: true,
        emitConsultationActivity: result.emitConsultationActivity,
        ...serializeConsultationSession(result.record),
      });
    }

    return NextResponse.json({ error: "Step not implemented." }, { status: 400 });
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
