import type { GrowthPath } from "@/types/coaching-growth";
import type { GrowthOpportunityRecord } from "@/types/coaching-growth";
import {
  growthPathToShareType,
  type GrowthShareType,
} from "@/types/coaching-referral-share";

export type ShareStartEligibility = {
  canStart: boolean;
  shareType: GrowthShareType | null;
  blockedReason: string | null;
  opportunityId: string | null;
};

/**
 * Coach may start a share only from an open Growth Opportunity (4e authority).
 * Does not recompute referral suitability.
 */
export function assessShareStartEligibility(input: {
  opportunity: Pick<
    GrowthOpportunityRecord,
    "id" | "status" | "primaryGrowthPath" | "secondaryPathsJson" | "readiness"
  > | null;
  requestedShareType?: GrowthShareType | null;
  asOfMs?: number;
}): ShareStartEligibility {
  const opportunity = input.opportunity;
  if (!opportunity) {
    return {
      canStart: false,
      shareType: null,
      blockedReason: "no_open_opportunity",
      opportunityId: null,
    };
  }
  if (opportunity.status !== "open") {
    return {
      canStart: false,
      shareType: null,
      blockedReason: "opportunity_not_open",
      opportunityId: opportunity.id,
    };
  }
  if (opportunity.readiness !== "strong" && opportunity.readiness !== "emerging") {
    return {
      canStart: false,
      shareType: null,
      blockedReason: "not_ready",
      opportunityId: opportunity.id,
    };
  }

  const eligiblePaths = [
    opportunity.primaryGrowthPath,
    ...(opportunity.secondaryPathsJson ?? []),
  ].filter(Boolean) as GrowthPath[];

  const eligibleTypes = eligiblePaths
    .map((path) => growthPathToShareType(path))
    .filter(Boolean) as GrowthShareType[];

  if (eligibleTypes.length === 0) {
    return {
      canStart: false,
      shareType: null,
      blockedReason: "no_eligible_path",
      opportunityId: opportunity.id,
    };
  }

  const requested = input.requestedShareType ?? null;
  if (requested) {
    if (!eligibleTypes.includes(requested)) {
      return {
        canStart: false,
        shareType: null,
        blockedReason: "path_not_eligible",
        opportunityId: opportunity.id,
      };
    }
    return {
      canStart: true,
      shareType: requested,
      blockedReason: null,
      opportunityId: opportunity.id,
    };
  }

  const primaryType = growthPathToShareType(opportunity.primaryGrowthPath);
  return {
    canStart: true,
    shareType: primaryType ?? eligibleTypes[0]!,
    blockedReason: null,
    opportunityId: opportunity.id,
  };
}

/** Active referral CTAs must pause when Rescue > Growth blocks the customer. */
export function shouldPauseSharesForRescue(input: {
  growthBlocked: boolean;
  shareStatus: string;
}): boolean {
  return input.growthBlocked && input.shareStatus === "active";
}

export function isShareAcceptingReferrals(input: {
  status: string;
  expiresAt: string | null;
  asOfMs: number;
}): boolean {
  if (input.status !== "active") return false;
  if (!input.expiresAt) return true;
  const expiresMs = Date.parse(input.expiresAt);
  if (Number.isNaN(expiresMs)) return true;
  return input.asOfMs < expiresMs;
}
