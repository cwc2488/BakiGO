import type { NextStep } from "./types";
import type { PromotionProgress } from "../calculate-promotion-progress";
import type { PromotionTree } from "../rules/promotion";
import { resolveRuleTarget } from "@/lib/rule-engine";
import { clampPercent } from "../utils";
import { applyTemplate, computeRemaining } from "./templates";

function applyPromotionTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

/**
 * Promotion next steps — templates from PromotionTree only.
 */
export function buildPromotionNextSteps(
  progress: PromotionProgress,
  tree: PromotionTree,
): NextStep[] {
  if (progress.isMaxRank || progress.isRuleMissing || progress.progressSource === "qualification") {
    return [];
  }

  const targetResult = resolveRuleTarget(
    progress.target,
    progress.ruleKey ?? "promotion.target",
    "promotion",
  );
  if (!targetResult.ok) {
    return [];
  }

  const target = targetResult.value;
  const current = progress.current;
  const remaining = computeRemaining(target, current);
  if (remaining <= 0) {
    return [];
  }

  const templates = tree.nextStepTemplates;
  const variables = {
    currentRankName: progress.currentRankName,
    nextRankName: progress.nextRankName ?? "",
    downlineRankName: progress.downlineRankName ?? "",
    current,
    target,
    remaining,
    progressPercent: progress.progressPercent ?? clampPercent((current / target) * 100),
  };

  const rewardXP = templates.rewardXP ?? 0;

  return [
    {
      stepKey: `promotion_${progress.ruleKey ?? progress.currentRankId}`,
      title: applyPromotionTemplate(templates.titleTemplate, variables),
      description: applyPromotionTemplate(templates.descriptionTemplate, variables),
      current,
      target,
      remaining,
      progressPercent: variables.progressPercent as number,
      priority: templates.priority,
      rewardXP,
    },
  ];
}
