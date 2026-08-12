import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { computeReferralCenterMetrics } from "@/lib/coaching/referral-share/conversion-policy";
import {
  deriveReferralCandidateView,
  type ReferralCandidateView,
} from "@/lib/coaching/referral-share/referral-presentation";
import {
  listAttributionsForOwner,
  listGrowthSharesForOwner,
} from "@/lib/coaching/referral-share/share-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type { GrowthPath } from "@/types/coaching-growth";
import type {
  GrowthShareRecord,
  ReferralAttributionRecord,
  ReferralCenterMetrics,
} from "@/types/coaching-referral-share";

export type ReferralCenterBundle = {
  candidates: ReferralCandidateView[];
  shares: GrowthShareRecord[];
  attributions: ReferralAttributionRecord[];
  needsCoach: ReferralAttributionRecord[];
  metrics: ReferralCenterMetrics & {
    suitableNowCount: number;
    sharingNowCount: number;
    newFriendsNeedingCoach: number;
  };
  customerNames: Record<string, string>;
};

/**
 * Referral Center loader — Customer is the parent set.
 * Batch queries only; Growth Opportunity is evidence, not a gate.
 */
export async function loadReferralCenterBundle(input: {
  ownerMemberId: string;
  asOfIso?: string;
}): Promise<ReferralCenterBundle> {
  const asOfIso = input.asOfIso ?? new Date().toISOString();
  const supabase = createSupabaseServiceClient();

  const [shares, attributions, opportunitiesResult, customersResult, enrollmentsResult, checkinsResult] =
    await Promise.all([
      listGrowthSharesForOwner({ ownerMemberId: input.ownerMemberId, limit: 200 }),
      listAttributionsForOwner({ ownerMemberId: input.ownerMemberId, limit: 200 }),
      supabase
        .from("growth_opportunities")
        .select(
          "id, customer_id, enrollment_id, readiness, status, primary_growth_path, secondary_paths_json, blocked_reasons_json",
        )
        .eq("owner_member_id", input.ownerMemberId)
        .eq("status", "open")
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("customers")
        .select("id, display_name, status")
        .eq("owner_member_id", input.ownerMemberId)
        .order("updated_at", { ascending: false })
        .limit(2000),
      supabase
        .from("coaching_enrollments")
        .select("id, customer_id, status")
        .eq("owner_member_id", input.ownerMemberId)
        .eq("status", "active")
        .limit(2000),
      supabase
        .from("customer_experience_checkins")
        .select(
          "customer_id, struggle_flag, decline_growth_ask, explicit_referral_intent, recommendation_willingness, experience_satisfaction, coach_helpfulness, responded_at",
        )
        .eq("owner_member_id", input.ownerMemberId)
        .order("responded_at", { ascending: false })
        .limit(500),
    ]);

  if (opportunitiesResult.error) {
    throw new CoachingServiceError(
      opportunitiesResult.error.message || "Failed to load opportunities.",
      500,
    );
  }
  if (customersResult.error) {
    throw new CoachingServiceError(customersResult.error.message || "Failed to load customers.", 500);
  }

  const customerNames: Record<string, string> = {};
  for (const row of customersResult.data ?? []) {
    customerNames[String(row.id)] = String(row.display_name);
  }

  const enrollmentByCustomer = new Map<string, string>();
  for (const row of enrollmentsResult.data ?? []) {
    enrollmentByCustomer.set(String(row.customer_id), String(row.id));
  }

  const opportunityByCustomer = new Map<
    string,
    {
      id: string;
      readiness: string;
      primaryGrowthPath: GrowthPath | null;
      secondaryPaths: GrowthPath[];
      blockedReasons: string[];
    }
  >();
  for (const row of opportunitiesResult.data ?? []) {
    const customerId = String(row.customer_id);
    if (opportunityByCustomer.has(customerId)) continue;
    const secondary = Array.isArray(row.secondary_paths_json)
      ? (row.secondary_paths_json as GrowthPath[])
      : [];
    const blocked = Array.isArray(row.blocked_reasons_json)
      ? (row.blocked_reasons_json as string[]).map(String)
      : [];
    opportunityByCustomer.set(customerId, {
      id: String(row.id),
      readiness: String(row.readiness ?? ""),
      primaryGrowthPath: (row.primary_growth_path as GrowthPath | null) ?? null,
      secondaryPaths: secondary,
      blockedReasons: blocked,
    });
  }

  const checkinByCustomer = new Map<
    string,
    {
      struggleFlag: boolean;
      declineGrowthAsk: boolean;
      explicitReferralIntent: boolean;
      recommendationWillingness: number | null;
      experienceSatisfaction: number | null;
      coachHelpfulness: number | null;
    }
  >();
  for (const row of checkinsResult.data ?? []) {
    const customerId = String(row.customer_id);
    if (checkinByCustomer.has(customerId)) continue;
    checkinByCustomer.set(customerId, {
      struggleFlag: Boolean(row.struggle_flag),
      declineGrowthAsk: Boolean(row.decline_growth_ask),
      explicitReferralIntent: Boolean(row.explicit_referral_intent),
      recommendationWillingness:
        row.recommendation_willingness != null ? Number(row.recommendation_willingness) : null,
      experienceSatisfaction:
        row.experience_satisfaction != null ? Number(row.experience_satisfaction) : null,
      coachHelpfulness: row.coach_helpfulness != null ? Number(row.coach_helpfulness) : null,
    });
  }

  const activeShareByCustomer = new Map<string, GrowthShareRecord>();
  const pendingShareByCustomer = new Map<string, GrowthShareRecord>();
  for (const share of shares) {
    if (share.status === "active" && !activeShareByCustomer.has(share.introducerCustomerId)) {
      activeShareByCustomer.set(share.introducerCustomerId, share);
    }
    if (
      share.status === "pending_consent" &&
      !pendingShareByCustomer.has(share.introducerCustomerId)
    ) {
      pendingShareByCustomer.set(share.introducerCustomerId, share);
    }
  }

  const attributionCountByCustomer = new Map<string, number>();
  const needsCoachByCustomer = new Set<string>();
  for (const row of attributions) {
    attributionCountByCustomer.set(
      row.introducerCustomerId,
      (attributionCountByCustomer.get(row.introducerCustomerId) ?? 0) + 1,
    );
    if (
      (row.status === "submitted" || row.status === "customer_created") &&
      !row.coachHandledAt
    ) {
      needsCoachByCustomer.add(row.introducerCustomerId);
    }
  }

  const needsCoach = attributions.filter(
    (row) =>
      (row.status === "submitted" || row.status === "customer_created") && !row.coachHandledAt,
  );

  const candidates: ReferralCandidateView[] = (customersResult.data ?? []).map((row) => {
    const customerId = String(row.id);
    const activeShare = activeShareByCustomer.get(customerId) ?? null;
    const pendingShare = pendingShareByCustomer.get(customerId) ?? null;
    return deriveReferralCandidateView({
      customerId,
      displayName: customerNames[customerId] ?? "顧客",
      hasEnrollment: enrollmentByCustomer.has(customerId),
      enrollmentId: enrollmentByCustomer.get(customerId) ?? null,
      openOpportunity: opportunityByCustomer.get(customerId) ?? null,
      latestCheckin: checkinByCustomer.get(customerId) ?? null,
      activeShare: activeShare
        ? { id: activeShare.id, shareType: activeShare.shareType, status: activeShare.status }
        : null,
      pendingConsentShare: pendingShare
        ? { id: pendingShare.id, shareType: pendingShare.shareType }
        : null,
      attributionCount: attributionCountByCustomer.get(customerId) ?? 0,
      needsCoachAttribution: needsCoachByCustomer.has(customerId),
      coachAttentionHint: Boolean(
        opportunityByCustomer.get(customerId)?.blockedReasons.includes("coach_attention_active"),
      ),
    });
  });

  // Sort: needs coach / best timing first, not_assessed later
  const stateRank: Record<string, number> = {
    has_referral: 0,
    best_timing: 1,
    ask_ready: 2,
    outcome_share_ready: 3,
    pause_care_first: 4,
    sharing_active: 5,
    nurturing: 6,
    not_assessed: 7,
  };
  candidates.sort((a, b) => (stateRank[a.state] ?? 9) - (stateRank[b.state] ?? 9));

  const baseMetrics = computeReferralCenterMetrics({
    asOfIso,
    shares: shares.map((share) => ({
      status: share.status,
      introducerCustomerId: share.introducerCustomerId,
      createdAt: share.createdAt,
    })),
    attributions: attributions.map((row) => ({
      status: row.status,
      linkedExistingCustomer: row.linkedExistingCustomer,
      submittedAt: row.submittedAt,
      convertedAt: row.convertedAt,
      createdAt: row.createdAt,
    })),
  });

  return {
    candidates,
    shares,
    attributions,
    needsCoach,
    metrics: {
      ...baseMetrics,
      suitableNowCount: candidates.filter((c) =>
        ["best_timing", "ask_ready", "outcome_share_ready"].includes(c.state),
      ).length,
      sharingNowCount: candidates.filter((c) => c.state === "sharing_active").length,
      newFriendsNeedingCoach: needsCoach.length,
    },
    customerNames,
  };
}
