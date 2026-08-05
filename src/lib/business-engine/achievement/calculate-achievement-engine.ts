import type { AchievementEngineResult } from "@/types/gamification";
import type { BusinessRulesConfig } from "../rules";
import { DEFAULT_BUSINESS_RULES } from "../rules";
import type { ActivityEvent } from "../types";
import { calculateRankProgress } from "../calculate-rank-progress";
import { resolvePromotionQualifiedRankIds } from "../promotion/resolve-qualified-ranks";
import { calculateAchievements } from "./calculate-achievements";
import { calculateBadges } from "./calculate-badges";
import { calculateStreak } from "./calculate-streak";
import { calculatePoints } from "./calculate-points";
import { collectGamificationEvents } from "./collect-events";

export interface CalculateAchievementEngineInput {
  memberId: string;
  referenceDate: string;
  yearMonth: string;
  currentRankKey: string;
  activities: ActivityEvent[];
  transactions: Array<{
    transactionDate: string;
    transactionTypeKey: string;
    amount: number;
  }>;
  vpTotal: number;
  mapActiveLines: number;
  monthlyChallengePercent: number;
  downlineRankCounts: Record<string, number>;
  qualificationResults?: import("../qualification/types").QualificationResult[];
  redemptions?: import("@/types/points").PointRedemption[];
}

function resolveQualifiedRankKeys(
  input: CalculateAchievementEngineInput,
  rules: BusinessRulesConfig,
): string[] {
  const rankKeys = rules.ranks.order;
  const qualified: string[] = [];

  rankKeys.forEach((rankKey) => {
    const progress = calculateRankProgress(
      {
        memberId: input.memberId,
        targetRankKey: rankKey,
        yearMonth: input.yearMonth,
        activities: input.activities,
      },
      rules,
    );

    if (progress.isQualified) {
      qualified.push(rankKey);
    }
  });

  return qualified;
}

/**
 * Full Achievement Engine — XP, Streak, Badges, Achievements.
 * All rules from config; UI reads output only.
 */
export function calculateAchievementEngine(
  input: CalculateAchievementEngineInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): AchievementEngineResult {
  const events = collectGamificationEvents({
    memberId: input.memberId,
    activities: input.activities,
    transactions: input.transactions,
  });

  const streak = calculateStreak(
    input.memberId,
    events,
    input.referenceDate,
    rules,
  );

  const qualifiedRankKeys = resolveQualifiedRankKeys(input, rules);
  const promotionQualifiedRankIds = resolvePromotionQualifiedRankIds(
    input.currentRankKey,
    rules.promotion,
    input.qualificationResults ?? [],
  );

  const evaluationContext = {
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    events,
    vpTotal: input.vpTotal,
    mapActiveLines: input.mapActiveLines,
    monthlyChallengePercent: input.monthlyChallengePercent,
    currentStreak: streak.currentStreak,
    currentRankKey: input.currentRankKey,
    qualifiedRankKeys,
    downlineRankCounts: input.downlineRankCounts,
    promotionQualifiedRankIds,
  };

  const achievements = calculateAchievements(evaluationContext, rules);
  const redemptions = input.redemptions ?? [];
  const points = calculatePoints(
    {
      memberId: input.memberId,
      referenceDate: input.referenceDate,
      yearMonth: input.yearMonth,
      events,
      redemptions,
    },
    rules,
  );
  const badges = calculateBadges(achievements, evaluationContext, rules);

  return {
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    points,
    streak,
    badges,
    achievements,
    qualifiedRankKeys,
    computedAt: new Date(),
  };
}
