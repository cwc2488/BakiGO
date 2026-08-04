import type { BusinessRulesConfig } from "./rules";
import { DEFAULT_BUSINESS_RULES } from "./rules";
import type { CalculateMapProgressInput, MapProgressResult } from "./types";
import {
  clampPercent,
  countActivitiesByKey,
  filterActivitiesByMember,
  filterActivitiesByYearMonth,
  getDirectDownline,
} from "./utils";

function isLineActive(
  downlineMember: { id: string; rankKey: string },
  downlineActivities: ReturnType<typeof filterActivitiesByYearMonth>,
  rules: BusinessRulesConfig,
): boolean {
  const rankIsActive = rules.presidentTree.activeRankKeys.includes(downlineMember.rankKey);
  if (rules.presidentTree.minActivityCount <= 0) {
    return rankIsActive;
  }

  const activityCount = rules.presidentTree.activityKeys.reduce(
    (total, activityKey) => total + countActivitiesByKey(downlineActivities, activityKey),
    0,
  );

  return rankIsActive && activityCount >= rules.presidentTree.minActivityCount;
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
    const activeLines = directDownline.filter((downlineMember) => {
      const downlineActivities = filterActivitiesByYearMonth(
        filterActivitiesByMember(input.activities, downlineMember.id),
        input.yearMonth,
      );
      return isLineActive(downlineMember, downlineActivities, rules);
    }).length;

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

    const downlineActivities = filterActivitiesByYearMonth(
      filterActivitiesByMember(input.activities, downlineMember.id),
      input.yearMonth,
    );

    return {
      lineIndex,
      downlineMemberId: downlineMember.id,
      isActive: isLineActive(downlineMember, downlineActivities, rules),
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
