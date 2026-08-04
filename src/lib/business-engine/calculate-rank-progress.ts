import type { BusinessRulesConfig } from "./rules";
import { DEFAULT_BUSINESS_RULES, RANK_KEYS } from "./rules";
import type { CalculateRankProgressInput, RankProgressResult } from "./types";
import {
  calculateWeightedProgress,
  countActivitiesByKey,
  criterionProgress,
  filterActivitiesByMember,
  filterActivitiesByYearMonth,
} from "./utils";

/**
 * Generic rank qualification progress driven by rules config.
 */
export function calculateRankProgress(
  input: CalculateRankProgressInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): RankProgressResult {
  const qualification = rules.rankQualification[input.targetRankKey];

  if (!qualification) {
    return {
      memberId: input.memberId,
      targetRankKey: input.targetRankKey,
      label: rules.ranks.labels[input.targetRankKey] ?? input.targetRankKey,
      overallProgressPercent: 0,
      isQualified: false,
      criteria: [],
    };
  }

  const memberActivities = filterActivitiesByMember(input.activities, input.memberId);
  const periodActivities = filterActivitiesByYearMonth(memberActivities, input.yearMonth);

  const criteria = qualification.criteria.flatMap((criterion) => {
    if (
      criterion.targetValue === null ||
      criterion.targetValue === undefined ||
      Number.isNaN(criterion.targetValue)
    ) {
      return [];
    }

    const currentValue = countActivitiesByKey(periodActivities, criterion.criterionKey);
    const progressPercent = criterionProgress(currentValue, criterion.targetValue);
    const weight = criterion.weight ?? 1;

    return [
      {
        criterionKey: criterion.criterionKey,
        currentValue,
        targetValue: criterion.targetValue,
        progressPercent: progressPercent ?? 0,
        weight,
      },
    ];
  });

  const overallProgressPercent = calculateWeightedProgress(
    criteria.map((item) => ({
      progressPercent: item.progressPercent,
      weight: item.weight,
    })),
  );

  const isQualified = criteria.every(
    (item) => item.currentValue >= item.targetValue,
  );

  return {
    memberId: input.memberId,
    targetRankKey: input.targetRankKey,
    label: qualification.label,
    overallProgressPercent: overallProgressPercent ?? 0,
    isQualified,
    criteria,
  };
}

/** Progress toward Supervisor rank. */
export function calculateSupervisorProgress(
  input: Omit<CalculateRankProgressInput, "targetRankKey">,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): RankProgressResult {
  return calculateRankProgress(
    { ...input, targetRankKey: RANK_KEYS.SUPERVISOR },
    rules,
  );
}

/** Progress toward World Team rank. */
export function calculateWorldTeamProgress(
  input: Omit<CalculateRankProgressInput, "targetRankKey">,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): RankProgressResult {
  return calculateRankProgress(
    { ...input, targetRankKey: RANK_KEYS.WORLD_TEAM },
    rules,
  );
}
