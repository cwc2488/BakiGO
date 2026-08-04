import type { AchievementRule } from "../rules/gamification";
import {
  ACHIEVEMENT_TRIGGER_TYPES,
  GAMIFICATION_EVENT_SOURCES,
} from "../rules/gamification";
import type { AdventureStepRule } from "@/lib/mission-engine/rules";
import {
  DEFAULT_PROMOTION_TREE,
  type PromotionAchievementMilestone,
  type PromotionTree,
} from "../rules/promotion";

function applyTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

function resolveMilestoneThreshold(
  milestone: PromotionAchievementMilestone,
  tree: PromotionTree,
): number | null {
  if (milestone.usePromotionRuleCount) {
    const rule = tree.rules.find(
      (item) => item.requirement.downlineRankId === milestone.rankId,
    );
    return rule?.requirement.requiredCount ?? null;
  }
  return milestone.requiredCount;
}

/**
 * Achievement rules derived from Promotion Tree — no hardcoded promotion KPIs.
 */
export function buildPromotionAchievementRules(
  tree: PromotionTree = DEFAULT_PROMOTION_TREE,
): AchievementRule[] {
  const templates = tree.achievementTemplates;
  const achievements: AchievementRule[] = [];

  tree.achievementMilestones.forEach((milestone) => {
    const rank = tree.ranks[milestone.rankId];
    const threshold = resolveMilestoneThreshold(milestone, tree);

    if (threshold === null || threshold === undefined || Number.isNaN(threshold)) {
      return;
    }

    if (milestone.type === "downline_count") {
      const template =
        threshold === 1 ? templates.firstDownline : templates.downlineLine;

      achievements.push({
        achievementKey: `promotion_${milestone.milestoneKey}`,
        eventSource: "downline_rank",
        triggerType: ACHIEVEMENT_TRIGGER_TYPES.COUNT,
        eventKey: milestone.rankId,
        threshold,
        rewardXP: template.rewardXP ?? 0,
        badgeKey: `badge_promotion_${milestone.milestoneKey}`,
        titleTemplate:
          threshold === 1 && milestone.milestoneKey.includes("line_1")
            ? applyTemplate(templates.downlineLine.titleTemplate, {
                rankName: rank.name,
                threshold,
              })
            : threshold === 1
              ? applyTemplate(templates.firstDownline.titleTemplate, { rankName: rank.name })
              : applyTemplate(templates.downlineLine.titleTemplate, {
                  rankName: rank.name,
                  threshold,
                }),
        descriptionTemplate:
          threshold === 1
            ? templates.firstDownline.descriptionTemplate
            : templates.downlineLine.descriptionTemplate,
      });
      return;
    }

    achievements.push({
      achievementKey: `promotion_${milestone.milestoneKey}`,
      eventSource: GAMIFICATION_EVENT_SOURCES.RANK_PROMOTION,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.THRESHOLD,
      eventKey: milestone.rankId,
      threshold,
      rewardXP: templates.rankReached.rewardXP ?? 0,
      badgeKey: `badge_promotion_${milestone.milestoneKey}`,
      titleTemplate: applyTemplate(templates.rankReached.titleTemplate, {
        rankName: rank.name,
      }),
      descriptionTemplate: applyTemplate(templates.rankReached.descriptionTemplate, {
        rankName: rank.name,
      }),
    });
  });

  return achievements;
}

/**
 * Adventure steps derived from Promotion ladder order — no hardcoded flow.
 */
export function buildPromotionAdventureSteps(
  tree: PromotionTree = DEFAULT_PROMOTION_TREE,
): AdventureStepRule[] {
  const adventure = tree.adventureTemplates;

  return tree.order.map((rankId, index) => {
    const rank = tree.ranks[rankId];
    const promotionRule = tree.rules.find((rule) => rule.fromRankId === rankId);
    const requirement = promotionRule?.requirement ?? rank.requirement;

    return {
      stepKey: `promotion_${rankId}`,
      order: index + 1,
      title: applyTemplate(adventure.stepTitleTemplate, { rankName: rank.name }),
      subtitle: adventure.stepSubtitleTemplate,
      descriptionTemplate: adventure.stepDescriptionTemplate,
      icon: rank.badge.replace("badge_", ""),
      color: rank.themeColor,
      eventSource: "downline_rank",
      triggerType: "count",
      eventKey: requirement?.downlineRankId,
      downlineRankKey: requirement?.downlineRankId,
      threshold: requirement?.requiredCount ?? null,
      xp: adventure.xp ?? 0,
    };
  });
}
