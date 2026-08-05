import type { BusinessRulesConfig } from "../rules";
import { DEFAULT_BUSINESS_RULES } from "../rules";
import { buildQualificationNextSteps } from "../qualification/build-next-steps";
import { buildPromotionNextSteps } from "./build-promotion-steps";
import { resolveRuleTarget } from "@/lib/rule-engine";
import { resolveVpTargetAmount } from "../rules/vp";
import { isCareerRankAtOrAbove } from "@/lib/auth/career-rank-order";
import { clampPercent } from "../utils";
import { applyTemplate, computeRemaining } from "./templates";
import type {
  CalculateNextStepsInput,
  NextStep,
  NextStepEngineResult,
} from "./types";

function filterActivitiesByDate(
  activities: CalculateNextStepsInput["activities"],
  date: string,
): CalculateNextStepsInput["activities"] {
  return activities.filter((activity) => activity.activityDate === date);
}

function buildStep(
  stepKey: string,
  titleTemplate: string,
  descriptionTemplate: string,
  current: number,
  target: number,
  priority: number,
  rewardXP: number,
  variables: Record<string, string | number>,
): NextStep | null {
  const remaining = computeRemaining(target, current);
  if (remaining <= 0) {
    return null;
  }

  return {
    stepKey,
    title: applyTemplate(titleTemplate, { ...variables, current, target, remaining }),
    description: applyTemplate(descriptionTemplate, {
      ...variables,
      current,
      target,
      remaining,
    }),
    current,
    target,
    remaining,
    progressPercent: clampPercent((current / target) * 100),
    priority,
    rewardXP,
  };
}

function buildVpRankSteps(
  input: CalculateNextStepsInput,
  rules: BusinessRulesConfig,
): NextStep[] {
  return rules.nextSteps.vpRankSteps.flatMap((stepRule) => {
    if (
      input.memberRankKey &&
      isCareerRankAtOrAbove(input.memberRankKey, stepRule.rankKey)
    ) {
      return [];
    }

    const targetResult = stepRule.vpTargetKey
      ? resolveRuleTarget(
          resolveVpTargetAmount(stepRule.vpTargetKey, rules.vp),
          `vpRules.${stepRule.vpTargetKey}`,
          "vp",
        )
      : resolveRuleTarget(
          stepRule.vpTarget,
          `nextSteps.${stepRule.stepKey}.vpTarget`,
          "next_step",
        );
    if (!targetResult.ok) {
      return [];
    }

    const rankLabel = rules.ranks.labels[stepRule.rankKey] ?? stepRule.rankKey;
    const current = input.vp.totalVp;
    const target = targetResult.value;

    const step = buildStep(
      stepRule.stepKey,
      stepRule.titleTemplate,
      stepRule.descriptionTemplate,
      current,
      target,
      stepRule.priority,
      stepRule.rewardXP,
      {
        rankLabel,
        unit: stepRule.unit,
      },
    );

    return step ? [step] : [];
  });
}

function buildMapSteps(
  input: CalculateNextStepsInput,
  rules: BusinessRulesConfig,
): NextStep[] {
  return rules.nextSteps.mapSteps.flatMap((stepRule) => {
    const targetResult = resolveRuleTarget(
      stepRule.targetActiveLines,
      `nextSteps.${stepRule.stepKey}.targetActiveLines`,
      "next_step",
    );
    if (!targetResult.ok) {
      return [];
    }

    const current = input.map.activeLines;
    const target = targetResult.value;

    const step = buildStep(
      stepRule.stepKey,
      stepRule.titleTemplate,
      stepRule.descriptionTemplate,
      current,
      target,
      stepRule.priority,
      stepRule.rewardXP,
      {
        milestoneLabel: stepRule.milestoneLabel,
        unit: stepRule.unit,
      },
    );

    return step ? [step] : [];
  });
}

function buildDailyActivitySteps(
  input: CalculateNextStepsInput,
  rules: BusinessRulesConfig,
): NextStep[] {
  const todayActivities = filterActivitiesByDate(input.activities, input.referenceDate);

  return rules.nextSteps.dailyActivitySteps.flatMap((stepRule) => {
    const targetResult = resolveRuleTarget(
      stepRule.dailyTarget,
      `nextSteps.${stepRule.stepKey}.dailyTarget`,
      "next_step",
    );
    if (!targetResult.ok) {
      return [];
    }

    const current = todayActivities.filter(
      (activity) => activity.activityKey === stepRule.activityKey,
    ).length;
    const target = targetResult.value;

    const step = buildStep(
      stepRule.stepKey,
      stepRule.titleTemplate,
      stepRule.descriptionTemplate,
      current,
      target,
      stepRule.priority,
      stepRule.rewardXP,
      {
        activityLabel: stepRule.activityLabel,
        unit: stepRule.unit,
      },
    );

    return step ? [step] : [];
  });
}

function buildMonthlyCriterionSteps(
  input: CalculateNextStepsInput,
  rules: BusinessRulesConfig,
): NextStep[] {
  const stepRule = rules.nextSteps.monthlyCriterionStep;
  if (!stepRule.enabled) {
    return [];
  }

  return input.monthlyChallenge.criteria.flatMap((criterion) => {
    const targetResult = resolveRuleTarget(
      criterion.targetValue,
      `monthlyChallenge.${criterion.criterionKey}.targetValue`,
      "business",
    );
    if (!targetResult.ok) {
      return [];
    }

    const current = criterion.currentValue;
    const target = targetResult.value;
    const unit = criterion.unit ?? stepRule.unit;

    const step = buildStep(
      `${stepRule.stepKey}_${criterion.criterionKey}`,
      stepRule.titleTemplate,
      stepRule.descriptionTemplate,
      current,
      target,
      stepRule.priority,
      stepRule.rewardXP,
      {
        milestoneLabel: criterion.label,
        unit,
      },
    );

    return step ? [step] : [];
  });
}

/**
 * Derives actionable next steps from computed business metrics.
 * All copy comes from rules templates — no hardcoded UI strings.
 */
export function calculateNextSteps(
  input: CalculateNextStepsInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): NextStepEngineResult {
  const qualificationSteps = input.qualificationResults
    ? buildQualificationNextSteps(input.qualificationResults, rules.qualification)
    : [];

  const promotionSteps = input.promotionProgress
    ? buildPromotionNextSteps(input.promotionProgress, rules.promotion)
    : [];

  const nextSteps = [
    ...qualificationSteps,
    ...promotionSteps,
    ...buildVpRankSteps(input, rules),
    ...buildMapSteps(input, rules),
    ...buildDailyActivitySteps(input, rules),
    ...buildMonthlyCriterionSteps(input, rules),
  ].sort((left, right) => left.priority - right.priority);

  return {
    nextSteps,
    computedAt: new Date(),
  };
}
