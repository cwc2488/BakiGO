import type { PromotionProgress } from "@/lib/business-engine/calculate-promotion-progress";
import type { QualificationResult } from "@/lib/business-engine/qualification/types";
import type { VpResult } from "@/lib/business-engine/types";
import type { MonthlyChallengeProgress } from "@/types";
import type { MemberGoalActionStep } from "@/types/member-goal";
import type { RetailPipelineSnapshot } from "@/types/retail-pipeline";

export type RankGuidanceMode = "foundation" | "organization";

export interface RankGuidanceView {
  mode: RankGuidanceMode;
  title: string;
  description: string;
  actionSteps: MemberGoalActionStep[];
}

/** Personal goal / pipeline playbook retired — rank guidance omitted. */
export function buildRankGuidance(_input: {
  rankKey: string;
  monthlyChallenge: MonthlyChallengeProgress;
  qualificationResults: QualificationResult[];
  promotionProgress: PromotionProgress;
  vp: VpResult;
  pipeline: RetailPipelineSnapshot | null;
}): RankGuidanceView | null {
  return null;
}
