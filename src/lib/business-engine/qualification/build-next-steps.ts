import type { NextStep } from "../next-step/types";
import type { QualificationResult } from "./types";
import type { QualificationRulesConfig } from "../rules/qualification";
import { DEFAULT_QUALIFICATION_RULES } from "../rules/qualification";
import { clampPercent } from "../utils";

function applyTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

export function buildQualificationNextSteps(
  results: QualificationResult[],
  config: QualificationRulesConfig = DEFAULT_QUALIFICATION_RULES,
): NextStep[] {
  const templates = config.nextStepTemplates;
  const rewardXP = templates.rewardXP ?? 0;

  return results.flatMap((result) => {
    if (result.isQualified || result.isRuleMissing || result.gaps.length === 0) {
      return [];
    }

    const primaryGap = result.gaps.sort((left, right) => right.remaining - left.remaining)[0];
    const variables = {
      targetRankName: result.targetRankName,
      label: primaryGap.label,
      current: primaryGap.current,
      target: primaryGap.target,
      remaining: primaryGap.remaining,
      progressPercent: primaryGap.progressPercent,
      unit: primaryGap.unit,
    };

    return [
      {
        stepKey: `qualification_${result.ruleKey}_${primaryGap.conditionKey}`,
        title: applyTemplate(templates.titleTemplate, variables),
        description: applyTemplate(templates.descriptionTemplate, variables),
        current: primaryGap.current,
        target: primaryGap.target,
        remaining: primaryGap.remaining,
        progressPercent: clampPercent(primaryGap.progressPercent),
        priority: templates.priority,
        rewardXP,
      },
    ];
  });
}

export function selectActiveQualificationResult(
  results: QualificationResult[],
  nextRankId: string | null,
): QualificationResult | null {
  if (!nextRankId) {
    return null;
  }
  return results.find((result) => result.targetRankId === nextRankId && !result.isQualified) ?? null;
}
