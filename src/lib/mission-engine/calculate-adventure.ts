import type { GamificationEvent } from "@/types/gamification";
import type {
  Adventure,
  AdventureStep,
  AdventureStepStatus,
  Mission,
} from "@/types/mission";
import { resolveTriggerMetric } from "@/lib/business-engine/achievement/collect-events";
import type { BusinessRulesConfig } from "@/lib/business-engine/rules";
import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import {
  buildPromotionAdventureSteps,
} from "@/lib/business-engine/promotion/build-derived-rules";
import type { PromotionRankId } from "@/lib/business-engine/rules/promotion";
import type { QualificationResult } from "@/lib/business-engine/qualification/types";
import { DEFAULT_QUALIFICATION_RULES } from "@/lib/business-engine/rules/qualification";
import {
  DEFAULT_MISSION_RULES,
  MISSION_CATEGORY_KEYS,
  MISSION_SOURCE_KEYS,
  type MissionRulesConfig,
} from "./rules";
import { applyTemplate, computeProgress, computeRemaining, resolveDifficultyKey } from "./utils";

export interface CalculateAdventureInput {
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
  qualificationResults: QualificationResult[];
}

function resolveAdventureMetric(
  stepRule: ReturnType<typeof buildPromotionAdventureSteps>[number],
  input: CalculateAdventureInput,
  businessRules: BusinessRulesConfig,
): number {
  return resolveTriggerMetric(
    {
      achievementKey: stepRule.stepKey,
      eventSource: stepRule.eventSource,
      triggerType: stepRule.triggerType,
      eventKey: stepRule.eventKey,
      threshold: stepRule.threshold ?? 0,
      rewardXP: stepRule.xp,
      titleTemplate: stepRule.title,
      descriptionTemplate: stepRule.descriptionTemplate,
    },
    {
      events: input.events,
      vpTotal: input.vpTotal,
      mapActiveLines: input.mapActiveLines,
      monthlyChallengePercent: input.monthlyChallengePercent,
      currentStreak: input.currentStreak,
      currentRankKey: input.currentRankKey,
      qualifiedRankKeys: input.qualifiedRankKeys,
      rankLabels: businessRules.ranks.labels,
      downlineRankCounts: input.downlineRankCounts,
      promotionQualifiedRankIds: input.promotionQualifiedRankIds,
    },
  );
}

function resolveAdventureStepStatus(
  current: number,
  target: number,
  previousCompleted: boolean,
): AdventureStepStatus {
  if (current >= target) {
    return "completed";
  }
  if (previousCompleted) {
    return "in_progress";
  }
  return "locked";
}

function stepRankId(stepKey: string): PromotionRankId {
  return stepKey.replace("promotion_", "") as PromotionRankId;
}

export function calculateAdventure(
  input: CalculateAdventureInput,
  _rules: MissionRulesConfig = DEFAULT_MISSION_RULES,
  businessRules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): Adventure {
  void _rules;
  const promotionTree = businessRules.promotion;
  const adventureTemplates = promotionTree.adventureTemplates;
  const adventureSteps = buildPromotionAdventureSteps(promotionTree);

  let previousCompleted = true;
  let currentStepKey: string | null = null;
  let completedStepCount = 0;

  const definedSteps = adventureSteps.filter(
    (stepRule) =>
      stepRule.threshold !== null &&
      stepRule.threshold !== undefined &&
      !Number.isNaN(stepRule.threshold),
  );

  const steps: AdventureStep[] = adventureSteps.map((stepRule) => {
    const rankId = stepRankId(stepRule.stepKey);
    const rank = promotionTree.ranks[rankId];
    const entryRuleKey = DEFAULT_QUALIFICATION_RULES.rankEntryRuleKeys[rankId];
    const qualification = input.qualificationResults.find(
      (result) => result.ruleKey === entryRuleKey,
    );

    if (entryRuleKey && qualification) {
      if (qualification.isRuleMissing) {
        return {
          stepKey: stepRule.stepKey,
          order: stepRule.order,
          title: stepRule.title,
          subtitle: stepRule.subtitle,
          description: applyTemplate(stepRule.descriptionTemplate, {
            description: rank.description,
          }),
          icon: stepRule.icon,
          color: stepRule.color,
          current: null,
          target: null,
          remaining: null,
          progress: null,
          status: "locked" as AdventureStepStatus,
          xp: stepRule.xp,
          isRuleMissing: true,
        };
      }

      const primaryGap = qualification.gaps[0];
      const isCompleted = qualification.isQualified;

      if (isCompleted) {
        return {
          stepKey: stepRule.stepKey,
          order: stepRule.order,
          title: stepRule.title,
          subtitle: stepRule.subtitle,
          description: qualification.description,
          icon: stepRule.icon,
          color: stepRule.color,
          current: primaryGap?.target ?? 0,
          target: primaryGap?.target ?? 0,
          remaining: 0,
          progress: 100,
          status: "completed" as AdventureStepStatus,
          xp: stepRule.xp,
          isRuleMissing: false,
        };
      }

      const current = primaryGap?.current ?? 0;
      const target = primaryGap?.target ?? null;
      const remaining = primaryGap?.remaining ?? null;
      const progress = primaryGap?.progressPercent ?? qualification.overallProgressPercent;

      return {
        stepKey: stepRule.stepKey,
        order: stepRule.order,
        title: stepRule.title,
        subtitle: stepRule.subtitle,
        description: qualification.description,
        icon: stepRule.icon,
        color: stepRule.color,
        current: target !== null ? current : null,
        target,
        remaining,
        progress,
        status: target !== null ? "in_progress" : "locked",
        xp: stepRule.xp,
        isRuleMissing: target === null,
      };
    }

    const hasThreshold =
      stepRule.threshold !== null &&
      stepRule.threshold !== undefined &&
      !Number.isNaN(stepRule.threshold);

    if (!hasThreshold) {
      return {
        stepKey: stepRule.stepKey,
        order: stepRule.order,
        title: stepRule.title,
        subtitle: stepRule.subtitle,
        description: applyTemplate(stepRule.descriptionTemplate, {
          description: rank.description,
        }),
        icon: stepRule.icon,
        color: stepRule.color,
        current: null,
        target: null,
        remaining: null,
        progress: null,
        status: "locked",
        xp: stepRule.xp,
        isRuleMissing: true,
      };
    }

    const current = resolveAdventureMetric(stepRule, input, businessRules);
    const target = stepRule.threshold as number;
    const remaining = computeRemaining(target, current);
    const progress = computeProgress(current, target);
    const status = resolveAdventureStepStatus(current, target, previousCompleted);

    if (status === "completed") {
      completedStepCount += 1;
      previousCompleted = true;
    } else {
      if (status === "in_progress" && currentStepKey === null) {
        currentStepKey = stepRule.stepKey;
      }
      previousCompleted = false;
    }

    return {
      stepKey: stepRule.stepKey,
      order: stepRule.order,
      title: stepRule.title,
      subtitle: stepRule.subtitle,
      description: applyTemplate(stepRule.descriptionTemplate, {
        description: rank.description,
        threshold: target,
        current,
        target,
        remaining,
      }),
      icon: stepRule.icon,
      color: stepRule.color,
      current,
      target,
      remaining,
      progress,
      status,
      xp: stepRule.xp,
      isRuleMissing: false,
    };
  });

  const overallProgress =
    definedSteps.length > 0
      ? Math.round((completedStepCount / definedSteps.length) * 100)
      : 0;

  return {
    adventureKey: adventureTemplates.adventureKey,
    title: adventureTemplates.title,
    description: adventureTemplates.description,
    steps,
    currentStepKey,
    overallProgress,
    completedStepCount,
    totalStepCount: adventureSteps.length,
  };
}

export function adventureStepToMission(
  step: AdventureStep,
  rules: MissionRulesConfig = DEFAULT_MISSION_RULES,
): Mission | null {
  if (step.status !== "in_progress" || step.isRuleMissing || step.target === null) {
    return null;
  }

  const category =
    rules.categories.find((item) => item.key === MISSION_CATEGORY_KEYS.GROWTH) ??
    rules.categories[0];

  return {
    id: `mission-adventure-${step.stepKey}`,
    title: step.title,
    subtitle: step.subtitle,
    description: step.description,
    category: category.key,
    priority: step.order,
    difficulty: resolveDifficultyKey(step.remaining ?? 0, step.target, rules.difficulties),
    icon: step.icon,
    color: step.color,
    current: step.current ?? 0,
    target: step.target,
    remaining: step.remaining ?? 0,
    progress: step.progress ?? 0,
    xp: step.xp,
    rewards: [
      {
        rewardKey: "xp",
        type: "xp",
        label: rules.rewardLabels.xp,
        value: step.xp,
        icon: "xp",
      },
    ],
    deadline: null,
    status: (step.remaining ?? 0) > 0 ? "in_progress" : "completed",
    sourceKey: MISSION_SOURCE_KEYS.ADVENTURE,
    sourceId: step.stepKey,
  };
}
