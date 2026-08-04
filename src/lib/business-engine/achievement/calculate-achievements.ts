import type { Achievement } from "@/types/gamification";
import type { GamificationEvent } from "@/types/gamification";
import type { BusinessRulesConfig } from "../rules";
import { DEFAULT_BUSINESS_RULES } from "../rules";
import { buildPromotionAchievementRules } from "../promotion/build-derived-rules";
import { applyTemplate } from "../next-step/templates";
import {
  findUnlockDate,
  resolveTriggerMetric,
} from "./collect-events";

export interface EvaluateAchievementsContext {
  memberId: string;
  referenceDate: string;
  events: GamificationEvent[];
  vpTotal: number;
  mapActiveLines: number;
  monthlyChallengePercent: number;
  currentStreak: number;
  currentRankKey: string;
  qualifiedRankKeys: string[];
  downlineRankCounts: Record<string, number>;
  promotionQualifiedRankIds: string[];
}

function evaluateAchievementRules(
  achievementRules: BusinessRulesConfig["gamification"]["achievements"],
  context: EvaluateAchievementsContext,
  rules: BusinessRulesConfig,
): Achievement[] {
  const rankLabels = rules.ranks.labels;
  const promotionRankNames = Object.fromEntries(
    Object.values(rules.promotion.ranks).map((rank) => [rank.rankId, rank.name]),
  );

  return achievementRules.flatMap((rule) => {
    if (
      rule.threshold === null ||
      rule.threshold === undefined ||
      Number.isNaN(rule.threshold)
    ) {
      return [];
    }

    const metricContext = {
      events: context.events,
      vpTotal: context.vpTotal,
      mapActiveLines: context.mapActiveLines,
      monthlyChallengePercent: context.monthlyChallengePercent,
      currentStreak: context.currentStreak,
      currentRankKey: context.currentRankKey,
      qualifiedRankKeys: context.qualifiedRankKeys,
      rankLabels,
      downlineRankCounts: context.downlineRankCounts,
      promotionQualifiedRankIds: context.promotionQualifiedRankIds,
    };

    const metric = resolveTriggerMetric(rule, metricContext);

    if (metric < rule.threshold) {
      return [];
    }

    const rankLabel = rule.eventKey
      ? rankLabels[rule.eventKey] ?? promotionRankNames[rule.eventKey] ?? rule.eventKey
      : "";
    const rankName = rule.eventKey ? promotionRankNames[rule.eventKey] ?? rankLabel : rankLabel;

    return [
      {
        achievementKey: rule.achievementKey,
        title: applyTemplate(rule.titleTemplate, {
          threshold: rule.threshold,
          rankLabel,
          rankName,
          metric,
        }),
        description: applyTemplate(rule.descriptionTemplate, {
          threshold: rule.threshold,
          rankLabel,
          rankName,
          metric,
        }),
        eventSource: rule.eventSource,
        unlockedAt: findUnlockDate(rule, context.events, context.referenceDate),
        rewardXP: rule.rewardXP,
        badgeKey: rule.badgeKey,
      },
    ];
  });
}

export function calculateAchievements(
  context: EvaluateAchievementsContext,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): Achievement[] {
  const promotionRules = buildPromotionAchievementRules(rules.promotion);
  const baseAchievements = evaluateAchievementRules(
    rules.gamification.achievements,
    context,
    rules,
  );
  const promotionAchievements = evaluateAchievementRules(promotionRules, context, rules);

  return [...baseAchievements, ...promotionAchievements];
}
