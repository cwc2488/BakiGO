import type { AnalysisSourceType } from "@/lib/analysis/analysis-attribution";

export type Experience21dOwnership = {
  attributionSourceType: AnalysisSourceType;
  ownerMemberId: string | null;
  growthShareId: string | null;
  quizShareCode: string | null;
  referrerMemberId: string | null;
  assignment: "partner" | "unassigned";
};

/**
 * Authority is copied from the analysis session — never re-guessed at CTA click.
 *
 * 1. referral_share + growth_shares.owner_member_id  ( /r  wins )
 * 2. quiz_member_share + referrer_member_id          ( /q )
 * 3. result_share (`/s`) stays unassigned — never invent a Partner from a consumer result share
 * 4. otherwise unassigned — never invent a partner
 */
export function resolve21dOwnership(input: {
  sourceType: AnalysisSourceType;
  growthShareId: string | null;
  growthShareOwnerMemberId: string | null;
  quizShareCode: string | null;
  referrerMemberId: string | null;
}): Experience21dOwnership {
  if (input.sourceType === "referral_share" && input.growthShareId && input.growthShareOwnerMemberId) {
    return {
      attributionSourceType: "referral_share",
      ownerMemberId: input.growthShareOwnerMemberId,
      growthShareId: input.growthShareId,
      quizShareCode: input.quizShareCode,
      referrerMemberId: input.referrerMemberId,
      assignment: "partner",
    };
  }
  if (input.sourceType === "quiz_member_share" && input.referrerMemberId) {
    return {
      attributionSourceType: "quiz_member_share",
      ownerMemberId: input.referrerMemberId,
      growthShareId: null,
      quizShareCode: input.quizShareCode,
      referrerMemberId: input.referrerMemberId,
      assignment: "partner",
    };
  }
  if (input.sourceType === "result_share") {
    return {
      attributionSourceType: "result_share",
      ownerMemberId: null,
      growthShareId: null,
      quizShareCode: null,
      referrerMemberId: null,
      assignment: "unassigned",
    };
  }
  return {
    attributionSourceType: input.sourceType === "radar_candidate" ? "radar_candidate" : "direct",
    ownerMemberId: null,
    growthShareId: null,
    quizShareCode: null,
    referrerMemberId: null,
    assignment: "unassigned",
  };
}
