import type { Achievement, Badge } from "@/types/gamification";
import type { BusinessRulesConfig } from "../rules";
import { DEFAULT_BUSINESS_RULES } from "../rules";
import type { EvaluateAchievementsContext } from "./calculate-achievements";
import {
  findUnlockDate,
  resolveTriggerMetric,
} from "./collect-events";

export function calculateBadges(
  achievements: Achievement[],
  context: EvaluateAchievementsContext,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): Badge[] {
  const earnedByAchievement = new Map(
    achievements.map((achievement) => [achievement.achievementKey, achievement]),
  );

  return rules.gamification.badges.flatMap((badgeRule) => {
    if (badgeRule.linkedAchievementKey) {
      const linked = earnedByAchievement.get(badgeRule.linkedAchievementKey);
      if (!linked) {
        return [];
      }

      return [
        {
          badgeKey: badgeRule.badgeKey,
          label: badgeRule.label,
          iconKey: badgeRule.iconKey,
          earnedAt: linked.unlockedAt,
          linkedAchievementKey: badgeRule.linkedAchievementKey,
        },
      ];
    }

    if (
      !badgeRule.eventSource ||
      !badgeRule.triggerType ||
      badgeRule.threshold === undefined ||
      badgeRule.threshold === null ||
      Number.isNaN(badgeRule.threshold)
    ) {
      return [];
    }

    const metric = resolveTriggerMetric(
      {
        achievementKey: badgeRule.badgeKey,
        eventSource: badgeRule.eventSource,
        triggerType: badgeRule.triggerType,
        eventKey: badgeRule.eventKey,
        threshold: badgeRule.threshold,
        rewardXP: 0,
        titleTemplate: "",
        descriptionTemplate: "",
      },
      {
        events: context.events,
        vpTotal: context.vpTotal,
        mapActiveLines: context.mapActiveLines,
        monthlyChallengePercent: context.monthlyChallengePercent,
        currentStreak: context.currentStreak,
        currentRankKey: context.currentRankKey,
        qualifiedRankKeys: context.qualifiedRankKeys,
        rankLabels: rules.ranks.labels,
        downlineRankCounts: context.downlineRankCounts,
        promotionQualifiedRankIds: context.promotionQualifiedRankIds,
      },
    );

    if (metric < badgeRule.threshold) {
      return [];
    }

    return [
      {
        badgeKey: badgeRule.badgeKey,
        label: badgeRule.label,
        iconKey: badgeRule.iconKey,
        earnedAt: findUnlockDate(
          {
            achievementKey: badgeRule.badgeKey,
            eventSource: badgeRule.eventSource,
            triggerType: badgeRule.triggerType,
            eventKey: badgeRule.eventKey,
            threshold: badgeRule.threshold,
            rewardXP: 0,
            titleTemplate: "",
            descriptionTemplate: "",
          },
          context.events,
          context.referenceDate,
        ),
      },
    ];
  });
}
