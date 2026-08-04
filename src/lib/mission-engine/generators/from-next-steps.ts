import type { NextStep } from "@/lib/business-engine/next-step/types";
import type { Mission, MissionReward } from "@/types/mission";
import {
  DEFAULT_MISSION_RULES,
  MISSION_SOURCE_KEYS,
  type MissionRulesConfig,
} from "../rules";
import {
  applyTemplate,
  computeProgress,
  computeRemaining,
  endOfDayDeadline,
  endOfMonthDeadline,
  resolveDifficultyKey,
  resolveMissionStatus,
  resolveNextStepMapping,
} from "../utils";

function buildRewards(xp: number, rules: MissionRulesConfig): MissionReward[] {
  return [
    {
      rewardKey: "xp",
      type: "xp",
      label: rules.rewardLabels.xp,
      value: xp,
      icon: "xp",
    },
  ];
}

function resolveDeadline(stepKey: string, referenceDate: string): string | null {
  if (stepKey.startsWith("daily_")) {
    return endOfDayDeadline(referenceDate);
  }
  if (stepKey.startsWith("monthly_")) {
    return endOfMonthDeadline(referenceDate);
  }
  return null;
}

export function generateMissionsFromNextSteps(
  nextSteps: NextStep[],
  referenceDate: string,
  rules: MissionRulesConfig = DEFAULT_MISSION_RULES,
): Mission[] {
  return nextSteps.map((step) => {
    const mapping = resolveNextStepMapping(
      step.stepKey,
      rules.nextStepMappings,
      rules.defaultNextStepMapping,
    );
    const remaining = computeRemaining(step.target, step.current);
    const progress = computeProgress(step.current, step.target);
    const difficulty = resolveDifficultyKey(
      remaining,
      step.target,
      rules.difficulties,
    );
    const deadline = resolveDeadline(step.stepKey, referenceDate);
    const xp = step.rewardXP;

    return {
      id: `mission-next-${step.stepKey}`,
      title: step.title,
      subtitle: applyTemplate(mapping.subtitleTemplate, {
        remaining,
        current: step.current,
        target: step.target,
        xp,
      }),
      description: applyTemplate(rules.defaultTemplate.descriptionTemplate, {
        remaining,
        current: step.current,
        target: step.target,
        xp,
      }),
      category: mapping.categoryKey,
      priority: step.priority,
      difficulty,
      icon: mapping.icon,
      color: mapping.color,
      current: step.current,
      target: step.target,
      remaining,
      progress,
      xp,
      rewards: buildRewards(xp, rules),
      deadline,
      status: resolveMissionStatus(step.current, step.target, deadline, referenceDate),
      sourceKey: MISSION_SOURCE_KEYS.NEXT_STEP,
      sourceId: step.stepKey,
    };
  });
}
