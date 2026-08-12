import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { assessShareStartEligibility } from "@/lib/coaching/referral-share/share-eligibility";
import {
  buildDefaultBenefit,
  buildPublicDisplayFromConsent,
  defaultBodyCopyForShareType,
  defaultHeadlineForShareType,
} from "@/lib/coaching/referral-share/public-payload";
import { generateGrowthShareToken, hashGrowthShareToken } from "@/lib/coaching/referral-share/share-token";
import { mapAttributionRow, mapGrowthShareRow } from "@/lib/coaching/referral-share/mappers";
import { updateGrowthOpportunityStatus } from "@/lib/coaching/growth/growth-opportunity-service";
import type { GrowthOpportunityRecord } from "@/types/coaching-growth";
import type {
  GrowthShareConsentSnapshot,
  GrowthShareRecord,
  GrowthShareType,
  ReferralAttributionRecord,
} from "@/types/coaching-referral-share";

function emptyConsent(): GrowthShareConsentSnapshot {
  return {
    consentedAt: null,
    consentedBy: null,
    showIntroducerName: false,
    showDayCount: true,
    showMeasurementDelta: false,
    shareText: null,
    measurementDeltaSummary: null,
  };
}

async function loadOpenOpportunity(input: {
  opportunityId: string;
  ownerMemberId: string;
}): Promise<GrowthOpportunityRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_opportunities")
    .select("*")
    .eq("id", input.opportunityId)
    .eq("owner_member_id", input.ownerMemberId)
    .maybeSingle();
  if (error) {
    throw new CoachingServiceError(error.message || "Failed to load growth opportunity.", 500);
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const secondary = Array.isArray(row.secondary_paths_json)
    ? (row.secondary_paths_json as string[])
    : [];
  return {
    id: String(row.id),
    ownerMemberId: String(row.owner_member_id),
    customerId: String(row.customer_id),
    enrollmentId: row.enrollment_id != null ? String(row.enrollment_id) : null,
    readiness: String(row.readiness) === "strong" ? "strong" : "emerging",
    status: String(row.status) as GrowthOpportunityRecord["status"],
    fingerprint: String(row.fingerprint ?? ""),
    celebrationClass: (String(row.celebration_class ?? "none") as GrowthOpportunityRecord["celebrationClass"]),
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
    primaryGrowthPath: (row.primary_growth_path as GrowthOpportunityRecord["primaryGrowthPath"]) ?? null,
    secondaryPathsJson: secondary as GrowthOpportunityRecord["secondaryPathsJson"],
    sourceCheckinId: row.source_checkin_id != null ? String(row.source_checkin_id) : null,
  };
}

export async function coachStartGrowthShare(input: {
  ownerMemberId: string;
  opportunityId: string;
  shareType?: GrowthShareType | null;
  expiresAt?: string | null;
}): Promise<{ share: GrowthShareRecord; plaintextToken: string }> {
  const opportunity = await loadOpenOpportunity({
    opportunityId: input.opportunityId,
    ownerMemberId: input.ownerMemberId,
  });
  const eligibility = assessShareStartEligibility({
    opportunity,
    requestedShareType: input.shareType ?? null,
  });
  if (!eligibility.canStart || !eligibility.shareType || !opportunity) {
    throw new CoachingServiceError(
      eligibility.blockedReason === "no_open_opportunity"
        ? "目前沒有可啟動的分享機會。"
        : "現在不適合啟動分享（成長機會未開放或路徑不符）。",
      400,
    );
  }

  const result = await insertPendingShare({
    ownerMemberId: input.ownerMemberId,
    introducerCustomerId: opportunity.customerId,
    enrollmentId: opportunity.enrollmentId,
    growthOpportunityId: opportunity.id,
    shareType: eligibility.shareType,
    expiresAt: input.expiresAt ?? null,
  });

  if (opportunity.enrollmentId) {
    await updateGrowthOpportunityStatus({
      opportunityId: opportunity.id,
      enrollmentId: opportunity.enrollmentId,
      ownerMemberId: input.ownerMemberId,
      status: "acted",
    }).catch(() => {
      // Share created; opportunity status is best-effort lifecycle mark.
    });
  }

  return result;
}

/**
 * Manual Coach start — Customer is enough.
 * Does not require Growth Opportunity or Coaching Enrollment.
 * Schema: enrollment_id / growth_opportunity_id remain nullable (033).
 */
export async function coachStartManualGrowthShare(input: {
  ownerMemberId: string;
  customerId: string;
  shareType?: GrowthShareType | null;
  opportunityId?: string | null;
  expiresAt?: string | null;
}): Promise<{ share: GrowthShareRecord; plaintextToken: string; warning: string | null }> {
  const supabase = createSupabaseServiceClient();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, owner_member_id")
    .eq("id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId)
    .maybeSingle();
  if (customerError || !customer) {
    throw new CoachingServiceError("找不到這位顧客。", customerError ? 500 : 404);
  }

  let enrollmentId: string | null = null;
  const { data: enrollment } = await supabase
    .from("coaching_enrollments")
    .select("id")
    .eq("customer_id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId)
    .eq("status", "active")
    .maybeSingle();
  if (enrollment?.id) enrollmentId = String(enrollment.id);

  let growthOpportunityId: string | null = input.opportunityId ?? null;
  let warning: string | null = null;

  if (growthOpportunityId) {
    const opportunity = await loadOpenOpportunity({
      opportunityId: growthOpportunityId,
      ownerMemberId: input.ownerMemberId,
    });
    if (!opportunity || opportunity.customerId !== input.customerId) {
      growthOpportunityId = null;
    } else if (
      Array.isArray(opportunity.blockedReasonsJson) &&
      (opportunity.blockedReasonsJson as string[]).some((code) =>
        ["rescue_active", "struggle_active", "coach_attention_active"].includes(String(code)),
      )
    ) {
      warning = "目前建議先處理顧客狀況";
    }
  }

  const shareType = input.shareType ?? "coach_referral";
  const result = await insertPendingShare({
    ownerMemberId: input.ownerMemberId,
    introducerCustomerId: input.customerId,
    enrollmentId,
    growthOpportunityId,
    shareType,
    expiresAt: input.expiresAt ?? null,
  });

  if (growthOpportunityId && enrollmentId) {
    await updateGrowthOpportunityStatus({
      opportunityId: growthOpportunityId,
      enrollmentId,
      ownerMemberId: input.ownerMemberId,
      status: "acted",
    }).catch(() => undefined);
  }

  return { ...result, warning };
}

async function insertPendingShare(input: {
  ownerMemberId: string;
  introducerCustomerId: string;
  enrollmentId: string | null;
  growthOpportunityId: string | null;
  shareType: GrowthShareType;
  expiresAt: string | null;
}): Promise<{ share: GrowthShareRecord; plaintextToken: string }> {
  const plaintextToken = generateGrowthShareToken();
  const tokenHash = hashGrowthShareToken(plaintextToken);
  const nowIso = new Date().toISOString();
  const consent = emptyConsent();
  const benefit = buildDefaultBenefit(input.shareType);
  const publicDisplay = {
    ...buildPublicDisplayFromConsent({
      shareType: input.shareType,
      consent,
      introducerDisplayName: null,
      dayCount: null,
    }),
    headline: defaultHeadlineForShareType(input.shareType),
    bodyCopy: defaultBodyCopyForShareType(input.shareType),
  };

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_shares")
    .insert({
      owner_member_id: input.ownerMemberId,
      introducer_customer_id: input.introducerCustomerId,
      enrollment_id: input.enrollmentId,
      growth_opportunity_id: input.growthOpportunityId,
      share_type: input.shareType,
      token_hash: tokenHash,
      status: "pending_consent",
      consent_snapshot_json: consent,
      public_display_json: publicDisplay,
      benefit_json: benefit,
      expires_at: input.expiresAt,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new CoachingServiceError(error?.message || "Failed to create growth share.", 500);
  }
  return { share: mapGrowthShareRow(data as Record<string, unknown>), plaintextToken };
}

export async function listGrowthSharesForOwner(input: {
  ownerMemberId: string;
  limit?: number;
}): Promise<GrowthShareRecord[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_shares")
    .select("*")
    .eq("owner_member_id", input.ownerMemberId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);
  if (error) {
    throw new CoachingServiceError(error.message || "Failed to list growth shares.", 500);
  }
  return (data ?? []).map((row) => mapGrowthShareRow(row as Record<string, unknown>));
}

export async function listAttributionsForOwner(input: {
  ownerMemberId: string;
  limit?: number;
}): Promise<ReferralAttributionRecord[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_referral_attributions")
    .select("*")
    .eq("owner_member_id", input.ownerMemberId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);
  if (error) {
    throw new CoachingServiceError(error.message || "Failed to list attributions.", 500);
  }
  return (data ?? []).map((row) => mapAttributionRow(row as Record<string, unknown>));
}

export async function revokeGrowthShare(input: {
  ownerMemberId: string;
  shareId: string;
}): Promise<GrowthShareRecord> {
  const supabase = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("growth_shares")
    .update({
      status: "revoked",
      revoked_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", input.shareId)
    .eq("owner_member_id", input.ownerMemberId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    throw new CoachingServiceError(error?.message || "Share not found.", error ? 500 : 404);
  }
  return mapGrowthShareRow(data as Record<string, unknown>);
}

export async function pauseGrowthShare(input: {
  ownerMemberId: string;
  shareId: string;
}): Promise<GrowthShareRecord> {
  const supabase = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("growth_shares")
    .update({
      status: "paused",
      paused_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", input.shareId)
    .eq("owner_member_id", input.ownerMemberId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    throw new CoachingServiceError(error?.message || "Share not found.", error ? 500 : 404);
  }
  return mapGrowthShareRow(data as Record<string, unknown>);
}

export async function markAttributionHandled(input: {
  ownerMemberId: string;
  attributionId: string;
}): Promise<ReferralAttributionRecord> {
  const supabase = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("growth_referral_attributions")
    .update({ coach_handled_at: nowIso, updated_at: nowIso })
    .eq("id", input.attributionId)
    .eq("owner_member_id", input.ownerMemberId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    throw new CoachingServiceError(error?.message || "Attribution not found.", error ? 500 : 404);
  }
  return mapAttributionRow(data as Record<string, unknown>);
}

/** Pause active shares for introducer when Rescue > Growth blocks. */
export async function pauseActiveSharesForCustomer(input: {
  ownerMemberId: string;
  customerId: string;
}): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("growth_shares")
    .update({
      status: "paused",
      paused_at: nowIso,
      updated_at: nowIso,
    })
    .eq("owner_member_id", input.ownerMemberId)
    .eq("introducer_customer_id", input.customerId)
    .eq("status", "active")
    .select("id");
  if (error) {
    throw new CoachingServiceError(error.message || "Failed to pause shares.", 500);
  }
  return (data ?? []).length;
}

export async function listPendingConsentSharesForCustomer(input: {
  ownerMemberId: string;
  customerId: string;
}): Promise<GrowthShareRecord[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_shares")
    .select("*")
    .eq("owner_member_id", input.ownerMemberId)
    .eq("introducer_customer_id", input.customerId)
    .in("status", ["pending_consent", "active", "paused"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    throw new CoachingServiceError(error.message || "Failed to list customer shares.", 500);
  }
  return (data ?? []).map((row) => mapGrowthShareRow(row as Record<string, unknown>));
}
