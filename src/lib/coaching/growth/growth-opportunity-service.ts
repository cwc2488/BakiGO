import { planReferralOpportunityReconciliation } from "@/lib/coaching/referral/reconcile-referral-opportunity";
import { evaluateGrowthMatrix } from "@/lib/coaching/growth/evaluate-growth-matrix";
import { getLatestExperienceCheckin } from "@/lib/coaching/growth/experience-checkin-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { CoachingServiceError, getCoachingEnrollmentForCoach } from "@/lib/coaching/coaching-service";
import { buildOutcomeSignal, type BuildOutcomeSignalInput } from "@/lib/coaching/referral/build-outcome-signal";
import type { GrowthMatrixResult, GrowthOpportunityRecord, GrowthPath } from "@/types/coaching-growth";
import {
  isReferralOpportunityStatus,
  type ReferralCelebrationClass,
  type ReferralOpportunityRecord,
  type ReferralOpportunityStatus,
} from "@/types/coaching-referral";

function mapRow(row: Record<string, unknown>): GrowthOpportunityRecord {
  const readinessRaw = String(row.readiness ?? "emerging");
  const readiness = readinessRaw === "strong" ? "strong" : "emerging";
  const statusRaw = String(row.status ?? "open");
  const celebrationRaw = String(row.celebration_class ?? "none");
  const celebrationClass = (["none", "soft", "clear"] as const).includes(
    celebrationRaw as ReferralCelebrationClass,
  )
    ? (celebrationRaw as ReferralCelebrationClass)
    : "none";
  const primaryRaw = row.primary_growth_path != null ? String(row.primary_growth_path) : null;
  const secondary = Array.isArray(row.secondary_paths_json)
    ? (row.secondary_paths_json as string[]).filter(Boolean) as GrowthPath[]
    : [];
  return {
    id: String(row.id),
    ownerMemberId: String(row.owner_member_id),
    customerId: String(row.customer_id),
    enrollmentId: row.enrollment_id != null ? String(row.enrollment_id) : null,
    readiness,
    status: isReferralOpportunityStatus(statusRaw) ? statusRaw : "open",
    fingerprint: String(row.fingerprint ?? ""),
    celebrationClass,
    outcomeStatusSnapshot: String(row.outcome_status_snapshot ?? ""),
    measurementStageSnapshot: String(row.measurement_stage_snapshot ?? ""),
    pathwaySnapshot: String(row.pathway_snapshot ?? "none"),
    evidenceJson: row.evidence_json ?? [],
    supportingSignalsJson: row.supporting_signals_json ?? [],
    blockedReasonsJson: row.blocked_reasons_json ?? [],
    snoozeUntil: row.snooze_until != null ? String(row.snooze_until) : null,
    expiresAt: row.expires_at != null ? String(row.expires_at) : null,
    supersededBy: row.superseded_by != null ? String(row.superseded_by) : null,
    lastEvaluatedAt: String(row.last_evaluated_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    outcomeBandSnapshot: String(row.outcome_band_snapshot ?? "unknown"),
    experienceBandSnapshot: String(row.experience_band_snapshot ?? "unknown"),
    primaryGrowthPath: primaryRaw as GrowthPath | null,
    secondaryPathsJson: secondary,
    sourceCheckinId: row.source_checkin_id != null ? String(row.source_checkin_id) : null,
  };
}

function toReferralRecord(row: GrowthOpportunityRecord): ReferralOpportunityRecord {
  const { outcomeBandSnapshot: _a, experienceBandSnapshot: _b, primaryGrowthPath: _c, secondaryPathsJson: _d, sourceCheckinId: _e, ...rest } = row;
  return rest;
}

export async function listGrowthOpportunitiesForEnrollment(input: {
  enrollmentId: string;
  ownerMemberId: string;
}): Promise<GrowthOpportunityRecord[]> {
  const enrollment = await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_opportunities")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .eq("owner_member_id", input.ownerMemberId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new CoachingServiceError(error.message || "Failed to list growth opportunities.", 500);
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function persistGrowthMatrixEvaluation(input: {
  enrollmentId: string;
  ownerMemberId: string;
  matrix: GrowthMatrixResult;
  asOfIso: string;
}): Promise<{
  plan: ReturnType<typeof planReferralOpportunityReconciliation>;
  record: GrowthOpportunityRecord | null;
  matrix: GrowthMatrixResult;
}> {
  const enrollment = await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });
  if (enrollment.customerId !== input.matrix.outcomeSignal.customerId) {
    throw new CoachingServiceError("Customer mismatch for growth opportunity.", 400);
  }

  const existing = await listGrowthOpportunitiesForEnrollment(input);
  const evaluation = {
    readiness: input.matrix.readiness,
    celebrationClass: input.matrix.celebrationClass,
    blockedReasons: input.matrix.blockedReasons,
    supportingSignals: input.matrix.supportingSignals,
    pathway: input.matrix.pathway,
    fingerprint: input.matrix.fingerprint,
    shouldOpen: input.matrix.shouldOpen,
    majorBreakthrough: input.matrix.majorBreakthrough,
    outcomeSignal: input.matrix.outcomeSignal,
  };
  const plan = planReferralOpportunityReconciliation({
    evaluation,
    existing: existing.map(toReferralRecord),
    asOfIso: input.asOfIso,
  });

  const supabase = createSupabaseServiceClient();
  const signal = input.matrix.outcomeSignal;
  const nowIso = new Date().toISOString();
  const basePayload = {
    owner_member_id: input.ownerMemberId,
    customer_id: signal.customerId,
    enrollment_id: input.enrollmentId,
    readiness: input.matrix.readiness === "strong" ? "strong" : "emerging",
    fingerprint: input.matrix.fingerprint,
    celebration_class: input.matrix.celebrationClass,
    outcome_status_snapshot: signal.outcomeStatus,
    measurement_stage_snapshot: signal.measurementStage,
    outcome_band_snapshot: input.matrix.outcomeBand,
    experience_band_snapshot: input.matrix.experienceBand,
    pathway_snapshot: input.matrix.pathway,
    primary_growth_path: input.matrix.primaryGrowthPath,
    secondary_paths_json: input.matrix.secondaryEligiblePaths,
    source_checkin_id: input.matrix.checkinId,
    evidence_json: [...signal.evidence, ...input.matrix.whyEvidence],
    supporting_signals_json: input.matrix.supportingSignals,
    blocked_reasons_json: input.matrix.blockedReasons,
    last_evaluated_at: nowIso,
    updated_at: nowIso,
  };

  if (plan.action === "noop") {
    return { plan, record: null, matrix: input.matrix };
  }

  if (plan.action === "update") {
    const { data, error } = await supabase
      .from("growth_opportunities")
      .update({
        ...basePayload,
        status: plan.status,
        expires_at: plan.expiresAt,
      })
      .eq("id", plan.opportunityId)
      .eq("owner_member_id", input.ownerMemberId)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      throw new CoachingServiceError(error?.message || "Failed to update growth opportunity.", 500);
    }
    return { plan, record: mapRow(data as Record<string, unknown>), matrix: input.matrix };
  }

  if (plan.action === "supersede") {
    const { data: created, error: createError } = await supabase
      .from("growth_opportunities")
      .insert({
        ...basePayload,
        status: "open",
        expires_at: plan.expiresAt,
        created_at: nowIso,
      })
      .select("*")
      .single();
    if (createError || !created) {
      throw new CoachingServiceError(createError?.message || "Failed to create growth opportunity.", 500);
    }
    await supabase
      .from("growth_opportunities")
      .update({
        status: "superseded",
        superseded_by: created.id,
        updated_at: nowIso,
        last_evaluated_at: nowIso,
      })
      .eq("id", plan.previousOpportunityId)
      .eq("owner_member_id", input.ownerMemberId);
    return { plan, record: mapRow(created as Record<string, unknown>), matrix: input.matrix };
  }

  const { data, error } = await supabase
    .from("growth_opportunities")
    .insert({
      ...basePayload,
      status: "open",
      expires_at: plan.expiresAt,
      created_at: nowIso,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new CoachingServiceError(error?.message || "Failed to insert growth opportunity.", 500);
  }
  return { plan, record: mapRow(data as Record<string, unknown>), matrix: input.matrix };
}

export async function updateGrowthOpportunityStatus(input: {
  opportunityId: string;
  enrollmentId: string;
  ownerMemberId: string;
  status: ReferralOpportunityStatus;
  snoozeUntil?: string | null;
}): Promise<GrowthOpportunityRecord> {
  await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });
  const supabase = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("growth_opportunities")
    .update({
      status: input.status,
      snooze_until: input.snoozeUntil ?? null,
      updated_at: nowIso,
      last_evaluated_at: nowIso,
    })
    .eq("id", input.opportunityId)
    .eq("enrollment_id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    throw new CoachingServiceError(error?.message || "Failed to update growth opportunity status.", error ? 500 : 404);
  }
  return mapRow(data as Record<string, unknown>);
}

export type GrowthReconcileContext = {
  enrollmentId: string;
  ownerMemberId: string;
  outcomeSignalInput: BuildOutcomeSignalInput;
  asOfIso?: string;
  recentAskAt?: string | null;
  recentDeclinedAt?: string | null;
  executionStable?: boolean;
};

/**
 * Event-driven Growth reconcile — call from measurement / check-in / attention / actions.
 */
export async function reconcileGrowthForEnrollment(
  input: GrowthReconcileContext,
): Promise<{
  matrix: GrowthMatrixResult;
  plan: ReturnType<typeof planReferralOpportunityReconciliation>;
  record: GrowthOpportunityRecord | null;
}> {
  const asOfIso = input.asOfIso ?? new Date().toISOString();
  const outcomeSignal = buildOutcomeSignal(input.outcomeSignalInput);
  const checkin = await getLatestExperienceCheckin({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  }).catch(() => null);

  const prior = await listGrowthOpportunitiesForEnrollment({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });

  const matrix = evaluateGrowthMatrix({
    outcomeSignal,
    evaluatingMemberId: input.ownerMemberId,
    checkin,
    priorOpportunities: prior.map(toReferralRecord),
    recentAskAt: input.recentAskAt,
    recentDeclinedAt: input.recentDeclinedAt,
    asOfIso,
    executionStable: input.executionStable,
  });

  const persisted = await persistGrowthMatrixEvaluation({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
    matrix,
    asOfIso,
  });

  return { matrix, plan: persisted.plan, record: persisted.record };
}
