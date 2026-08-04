import type { BusinessRulesConfig } from "./rules";
import { DEFAULT_BUSINESS_RULES, LEADERBOARD_METRICS } from "./rules";
import { calculateMonthlyProgress } from "./calculate-monthly-progress";
import type { CalculateLeaderboardInput, LeaderboardEntry, LeaderboardResult } from "./types";
import {
  filterActivitiesByMember,
  filterActivitiesByYearMonth,
} from "./utils";

function resolveMemberScore(
  memberId: string,
  metricKey: string,
  input: CalculateLeaderboardInput,
): number {
  const memberActivities = filterActivitiesByMember(input.activities, memberId);
  const periodActivities = filterActivitiesByYearMonth(memberActivities, input.yearMonth);

  switch (metricKey) {
    case LEADERBOARD_METRICS.ACTIVITY_COUNT:
      return periodActivities.length;

    case LEADERBOARD_METRICS.RETAIL_AMOUNT: {
      return input.transactions
        .filter(
          (transaction) =>
            transaction.memberId === memberId &&
            transaction.transactionDate.startsWith(input.yearMonth),
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    }

    case LEADERBOARD_METRICS.MONTHLY_CHALLENGE_PROGRESS:
    default: {
      const challenge = input.challenges.find(
        (item) => item.yearMonth === input.yearMonth,
      );

      if (!challenge) {
        return 0;
      }

      return calculateMonthlyProgress({
        memberId,
        yearMonth: input.yearMonth,
        challenge,
        activities: input.activities,
      }).overallProgressPercent;
    }
  }
}

/**
 * Ranks members by a configurable metric for the given month.
 */
export function calculateLeaderboard(
  input: CalculateLeaderboardInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): LeaderboardResult {
  const metricKey = input.metricKey ?? rules.leaderboard.defaultMetricKey;
  const limit = input.limit ?? rules.leaderboard.limit;

  const scored = input.members.map((member) => ({
    member,
    score: resolveMemberScore(member.id, metricKey, input),
  }));

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.member.displayName.localeCompare(right.member.displayName, "zh-Hant");
  });

  const entries: LeaderboardEntry[] = scored.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    memberId: item.member.id,
    displayName: item.member.displayName,
    nickname: item.member.nickname,
    rankKey: item.member.rankKey,
    score: item.score,
    metricKey,
  }));

  return {
    yearMonth: input.yearMonth,
    metricKey,
    entries,
  };
}
