import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError, getCoachingEnrollmentForCoach } from "@/lib/coaching/coaching-service";
import { mapBodyRecordRow } from "@/lib/coaching/ai/load-coaching-generation-context";
import {
  bandLabel,
  buildGrowthIntelligence,
  growthPathLabel,
  readinessLabel,
} from "@/lib/coaching/growth/build-growth-intelligence";
import { getLatestExperienceCheckin } from "@/lib/coaching/growth/experience-checkin-service";
import {
  listGrowthOpportunitiesForEnrollment,
  persistGrowthMatrixEvaluation,
  updateGrowthOpportunityStatus,
} from "@/lib/coaching/growth/growth-opportunity-service";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { isReferralOpportunityStatus } from "@/types/coaching-referral";
import { getCoachingAiOutputForDay } from "@/lib/coaching/ai/coaching-ai-store";

export const runtime = "nodejs";

async function loadGrowthBundle(input: {
  enrollmentId: string;
  ownerMemberId: string;
  logDate: string;
  reconcile: boolean;
}) {
  const enrollment = await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });
  const supabase = createSupabaseServiceClient();
  const { data: bodyRows } = await supabase
    .from("body_composition_records")
    .select("*")
    .eq("customer_id", enrollment.customerId)
    .order("record_date", { ascending: false });

  const checkin = await getLatestExperienceCheckin({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });

  let finalInterventionLevel: "normal" | "watch" | "coach_attention" = "normal";
  let attentionTier: "routine" | "watch" | "coach_attention" = "routine";
  try {
    const ai = await getCoachingAiOutputForDay({
      enrollmentId: input.enrollmentId,
      logDate: input.logDate,
    });
    if (ai?.finalInterventionLevel === "coach_attention" || ai?.finalInterventionLevel === "watch") {
      finalInterventionLevel = ai.finalInterventionLevel;
    }
    if (ai?.finalInterventionLevel === "coach_attention") {
      attentionTier = "coach_attention";
    } else if (ai?.finalInterventionLevel === "watch") {
      attentionTier = "watch";
    }
  } catch {
    // AI optional
  }

  const prior = await listGrowthOpportunitiesForEnrollment({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });

  const matrix = buildGrowthIntelligence({
    enrollment,
    ownerMemberId: input.ownerMemberId,
    bodyRecords: (bodyRows ?? []).map((row) => mapBodyRecordRow(row as Record<string, unknown>)),
    logDate: input.logDate,
    checkin,
    attentionTier,
    finalInterventionLevel,
    priorOpportunities: prior.map((row) => ({
      id: row.id,
      ownerMemberId: row.ownerMemberId,
      customerId: row.customerId,
      enrollmentId: row.enrollmentId,
      readiness: row.readiness,
      status: row.status,
      fingerprint: row.fingerprint,
      celebrationClass: row.celebrationClass,
      outcomeStatusSnapshot: row.outcomeStatusSnapshot,
      measurementStageSnapshot: row.measurementStageSnapshot,
      pathwaySnapshot: row.pathwaySnapshot,
      evidenceJson: row.evidenceJson,
      supportingSignalsJson: row.supportingSignalsJson,
      blockedReasonsJson: row.blockedReasonsJson,
      snoozeUntil: row.snoozeUntil,
      expiresAt: row.expiresAt,
      supersededBy: row.supersededBy,
      lastEvaluatedAt: row.lastEvaluatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  });

  let record = prior[0] ?? null;
  if (input.reconcile) {
    const persisted = await persistGrowthMatrixEvaluation({
      enrollmentId: input.enrollmentId,
      ownerMemberId: input.ownerMemberId,
      matrix,
      asOfIso: new Date().toISOString(),
    });
    record = persisted.record ?? record;
  }

  return {
    matrix,
    checkin,
    opportunity: record,
    coachView: {
      suitableNow: matrix.shouldOpen,
      headline: readinessLabel(matrix.readiness),
      measuredOutcome: `${matrix.outcomeSignal.outcomeStatus}（${bandLabel(matrix.outcomeBand)}）`,
      perceivedOutcome: checkin?.outcomePerception ?? null,
      coachHelpfulness: checkin?.coachHelpfulness ?? null,
      experienceSatisfaction: checkin?.experienceSatisfaction ?? null,
      recommendationWillingness: checkin?.recommendationWillingness ?? null,
      mostFeltChange: checkin?.mostFeltChangeText ?? null,
      experienceBand: bandLabel(matrix.experienceBand),
      primaryPath: growthPathLabel(matrix.primaryGrowthPath),
      primaryPathCode: matrix.primaryGrowthPath,
      whyEvidence: matrix.whyEvidence,
      repairExperience: matrix.repairExperience,
      inviteCheckin: matrix.inviteCheckin,
      celebrationClass: matrix.celebrationClass,
    },
  };
}

/** Coach-only Growth Intelligence. Never expose to Customer portal. */
export async function GET(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    const url = new URL(request.url);
    const logDate = url.searchParams.get("logDate") ?? coachingTodayLogDate();
    const reconcile = url.searchParams.get("reconcile") === "1";
    const bundle = await loadGrowthBundle({
      enrollmentId,
      ownerMemberId: memberId,
      logDate,
      reconcile,
    });
    return NextResponse.json({ ok: true, ...bundle });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load growth intelligence.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    const body = (await request.json()) as {
      opportunityId?: string;
      status?: string;
      snoozeUntil?: string | null;
    };
    if (!body.opportunityId?.trim()) {
      return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
    }
    if (!body.status || !isReferralOpportunityStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (!["acted", "snoozed", "declined", "expired"].includes(body.status)) {
      return NextResponse.json({ error: "Status transition not allowed." }, { status: 400 });
    }

    const opportunity = await updateGrowthOpportunityStatus({
      opportunityId: body.opportunityId,
      enrollmentId,
      ownerMemberId: memberId,
      status: body.status,
      snoozeUntil: body.snoozeUntil ?? null,
    });

    // Event: growth action → re-evaluate (decline/ask cooldown)
    const bundle = await loadGrowthBundle({
      enrollmentId,
      ownerMemberId: memberId,
      logDate: coachingTodayLogDate(),
      reconcile: true,
    });

    return NextResponse.json({ ok: true, updatedOpportunity: opportunity, ...bundle });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to update growth opportunity.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
