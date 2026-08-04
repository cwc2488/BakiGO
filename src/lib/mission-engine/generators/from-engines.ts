import type { AchievementEngineResult } from "@/types/gamification";
import type { PromotionProgress } from "@/lib/business-engine/calculate-promotion-progress";
import type { Mission, MissionReward } from "@/types/mission";
import type { MonthlyChallengeProgress } from "@/types/monthly-challenge";
import { resolveRuleTarget } from "@/lib/rule-engine";
import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import type { QualificationResult } from "@/lib/business-engine/qualification/types";
import type { QualificationRulesConfig } from "@/lib/business-engine/rules/qualification";
import { DEFAULT_QUALIFICATION_RULES } from "@/lib/business-engine/rules/qualification";
import {
  DEFAULT_MISSION_RULES,
  MISSION_CATEGORY_KEYS,
  MISSION_SOURCE_KEYS,
  type MissionRulesConfig,
} from "../rules";
import {
  applyTemplate,
  computeProgress,
  computeRemaining,
  endOfMonthDeadline,
  resolveDifficultyKey,
  resolveMissionStatus,
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

function getCategoryStyle(categoryKey: string, rules: MissionRulesConfig) {
  return (
    rules.categories.find((category) => category.key === categoryKey) ??
    rules.categories[0]
  );
}

export function generateMissionsFromAchievements(
  gamification: AchievementEngineResult,
  rules: MissionRulesConfig = DEFAULT_MISSION_RULES,
): Mission[] {
  const streakCategory = getCategoryStyle(MISSION_CATEGORY_KEYS.STREAK, rules);

  if (gamification.streak.currentStreak > 0 && !gamification.streak.isActiveToday) {
    const targetResult = resolveRuleTarget(
      rules.streakMaintain.dailyTarget,
      "streakMaintain.dailyTarget",
      "mission",
    );
    if (!targetResult.ok) {
      return [];
    }

    const target = targetResult.value;
    const current = 0;
    const remaining = computeRemaining(target, current);
    const xp = rules.streakMaintain.xp;
    const referenceDate = gamification.referenceDate;

    return [
      {
        id: "mission-streak-maintain",
        title: applyTemplate(rules.streakMaintain.titleTemplate, {
          current: gamification.streak.currentStreak,
        }),
        subtitle: rules.streakMaintain.subtitleTemplate,
        description: applyTemplate(rules.defaultTemplate.descriptionTemplate, {
          current,
          target,
          remaining,
          xp,
        }),
        category: MISSION_CATEGORY_KEYS.STREAK,
        priority: rules.streakMaintain.priority,
        difficulty: resolveDifficultyKey(remaining, target, rules.difficulties),
        icon: streakCategory.icon,
        color: streakCategory.color,
        current,
        target,
        remaining,
        progress: computeProgress(current, target),
        xp,
        rewards: buildRewards(xp, rules),
        deadline: referenceDate,
        status: resolveMissionStatus(current, target, referenceDate, referenceDate),
        sourceKey: MISSION_SOURCE_KEYS.ACHIEVEMENT,
        sourceId: "streak_maintain",
      },
    ];
  }

  return [];
}

export function generateMissionsFromBusiness(
  monthlyChallenge: MonthlyChallengeProgress,
  referenceDate: string,
  rules: MissionRulesConfig = DEFAULT_MISSION_RULES,
): Mission[] {
  const category = getCategoryStyle(MISSION_CATEGORY_KEYS.CHALLENGE, rules);
  const deadline = endOfMonthDeadline(referenceDate);

  const targetResult = resolveRuleTarget(
    rules.monthlyChallengeMission.overallTarget,
    "monthlyChallengeMission.overallTarget",
    "mission",
  );
  if (!targetResult.ok) {
    return [];
  }

  const target = targetResult.value;
  const current = monthlyChallenge.overallProgressPercent;

  if (current >= target) {
    return [];
  }

  const remaining = computeRemaining(target, current);
  const xp = rules.monthlyChallengeMission.xp;

  return [
    {
      id: "mission-monthly-challenge-overall",
      title: monthlyChallenge.title,
      subtitle: applyTemplate(rules.monthlyChallengeMission.subtitleTemplate, { current }),
      description: applyTemplate(rules.defaultTemplate.descriptionTemplate, {
        current,
        target,
        remaining,
        xp,
      }),
      category: MISSION_CATEGORY_KEYS.CHALLENGE,
      priority: rules.monthlyChallengeMission.priority,
      difficulty: resolveDifficultyKey(remaining, target, rules.difficulties),
      icon: category.icon,
      color: category.color,
      current,
      target,
      remaining,
      progress: computeProgress(current, target),
      xp,
      rewards: buildRewards(xp, rules),
      deadline,
      status: resolveMissionStatus(current, target, deadline, referenceDate),
      sourceKey: MISSION_SOURCE_KEYS.BUSINESS,
      sourceId: monthlyChallenge.challengeId,
    },
  ];
}

function applyPromotionTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

export function generateMissionsFromPromotion(
  progress: PromotionProgress,
  referenceDate: string,
  rules: MissionRulesConfig = DEFAULT_MISSION_RULES,
  businessRules = DEFAULT_BUSINESS_RULES,
): Mission[] {
  if (progress.qualificationResult) {
    return [];
  }

  if (progress.isRuleMissing || progress.isMaxRank) {
    return [];
  }

  const target = progress.target;
  if (target === null || target === undefined || Number.isNaN(target)) {
    return [];
  }

  const current = progress.current;
  const remaining = computeRemaining(target, current);
  if (remaining <= 0) {
    return [];
  }

  const templates = businessRules.promotion.missionTemplates;
  const category = getCategoryStyle(MISSION_CATEGORY_KEYS.CAREER, rules);
  const variables = {
    currentRankName: progress.currentRankName,
    nextRankName: progress.nextRankName ?? "",
    downlineRankName: progress.downlineRankName ?? "",
    current,
    target,
    remaining,
    progressPercent: progress.progressPercent ?? 0,
  };

  return [
    {
      id: `mission-promotion-${progress.ruleKey ?? progress.currentRankId}`,
      title: applyPromotionTemplate(templates.titleTemplate, variables),
      subtitle: applyPromotionTemplate(templates.subtitleTemplate, variables),
      description: applyPromotionTemplate(rules.defaultTemplate.descriptionTemplate, {
        ...variables,
        xp: 0,
      }),
      category: MISSION_CATEGORY_KEYS.CAREER,
      priority: templates.priority,
      difficulty: resolveDifficultyKey(remaining, target, rules.difficulties),
      icon: category.icon,
      color: progress.themeColor ?? category.color,
      current,
      target,
      remaining,
      progress: computeProgress(current, target),
      xp: 0,
      rewards: buildRewards(0, rules),
      deadline: null,
      status: resolveMissionStatus(current, target, null, referenceDate),
      sourceKey: MISSION_SOURCE_KEYS.BUSINESS,
      sourceId: progress.ruleKey ?? "promotion",
    },
  ];
}

function applyQualificationTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

export function generateMissionsFromQualification(
  results: QualificationResult[],
  referenceDate: string,
  rules: MissionRulesConfig = DEFAULT_MISSION_RULES,
  qualificationConfig: QualificationRulesConfig = DEFAULT_QUALIFICATION_RULES,
): Mission[] {
  const templates = qualificationConfig.missionTemplates;
  const category = getCategoryStyle(MISSION_CATEGORY_KEYS.CAREER, rules);

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
    };

    return [
      {
        id: `mission-qualification-${result.ruleKey}-${primaryGap.conditionKey}`,
        title: applyQualificationTemplate(templates.titleTemplate, variables),
        subtitle: applyQualificationTemplate(templates.subtitleTemplate, variables),
        description: applyQualificationTemplate(rules.defaultTemplate.descriptionTemplate, {
          ...variables,
          xp: 0,
        }),
        category: MISSION_CATEGORY_KEYS.CAREER,
        priority: templates.priority,
        difficulty: resolveDifficultyKey(
          primaryGap.remaining,
          primaryGap.target,
          rules.difficulties,
        ),
        icon: category.icon,
        color: category.color,
        current: primaryGap.current,
        target: primaryGap.target,
        remaining: primaryGap.remaining,
        progress: computeProgress(primaryGap.current, primaryGap.target),
        xp: 0,
        rewards: buildRewards(0, rules),
        deadline: null,
        status: resolveMissionStatus(
          primaryGap.current,
          primaryGap.target,
          null,
          referenceDate,
        ),
        sourceKey: MISSION_SOURCE_KEYS.BUSINESS,
        sourceId: result.ruleKey,
      },
    ];
  });
}
