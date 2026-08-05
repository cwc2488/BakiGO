import { isCareerRankAtOrAbove } from "@/lib/auth/career-rank-order";
import { RANK_KEYS } from "./rules/keys";
import type { QualificationResult } from "./qualification/types";

/** 第一代下線是否已達活躍督導（含更高位階，或由 Engine 判定資格已達成）。 */
export function isActiveSupervisorDownline(
  rankKey: string,
  qualificationResults?: QualificationResult[],
): boolean {
  if (isCareerRankAtOrAbove(rankKey, RANK_KEYS.ACTIVE_SUPERVISOR)) {
    return true;
  }

  if (!qualificationResults?.length) {
    return false;
  }

  return qualificationResults.some(
    (result) =>
      result.isQualified &&
      (result.ruleKey === "qualification_active_supervisor" ||
        result.ruleKey === "qualification_world_team"),
  );
}
