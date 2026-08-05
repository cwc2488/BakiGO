import type { BusinessRulesConfig } from "./rules";
import { isActiveSupervisorDownline } from "./active-supervisor-line";
import { DEFAULT_BUSINESS_RULES } from "./rules";
import type { CalculateMapProgressInput, MapProgressResult } from "./types";
import { clampPercent, getDirectDownline } from "./utils";

function isLineActive(
  downlineMember: { id: string; rankKey: string },
): boolean {
  return isActiveSupervisorDownline(downlineMember.rankKey);
}

/**
 * Computes 總裁之路 map progress — active lines toward President rank.
 */
export function calculateMapProgress(
  input: CalculateMapProgressInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): MapProgressResult {
  const directDownline = getDirectDownline(input.members, input.memberId);
  const totalLines = rules.presidentTree.totalLines;

  if (totalLines === null || totalLines === undefined || Number.isNaN(totalLines)) {
    const activeLines = directDownline.filter((downlineMember) =>
      isLineActive(downlineMember),
    ).length;

    return {
      memberId: input.memberId,
      yearMonth: input.yearMonth,
      totalLines: null,
      activeLines,
      progressPercent: null,
      lines: [],
    };
  }

  const lineStatuses = Array.from({ length: totalLines }, (_, lineIndex) => {
    const downlineMember = directDownline[lineIndex] ?? null;

    if (!downlineMember) {
      return {
        lineIndex,
        downlineMemberId: null,
        isActive: false,
      };
    }

    return {
      lineIndex,
      downlineMemberId: downlineMember.id,
      isActive: isLineActive(downlineMember),
    };
  });

  const activeLines = lineStatuses.filter((line) => line.isActive).length;

  return {
    memberId: input.memberId,
    yearMonth: input.yearMonth,
    totalLines,
    activeLines,
    progressPercent: clampPercent((activeLines / totalLines) * 100),
    lines: lineStatuses,
  };
}
