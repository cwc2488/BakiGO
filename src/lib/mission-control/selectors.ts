import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { AdventureStep } from "@/types/mission";
import type { NextStep } from "@/lib/business-engine/next-step/types";
import type { Achievement, Badge } from "@/types/gamification";

/** Pick the first engine-provided coach message — no business logic. */
export function selectDailyCoach(metrics: MemberComputedMetrics): string {
  const topMission = metrics.missions.dailyMissionSet.missions[0];
  if (topMission?.description) {
    return topMission.description;
  }
  if (metrics.nextSteps[0]?.description) {
    return metrics.nextSteps[0].description;
  }
  if (metrics.missions.adventure.description) {
    return metrics.missions.adventure.description;
  }
  return metrics.monthlyChallenge.title;
}

export function selectDailyQuote(metrics: MemberComputedMetrics): string {
  if (metrics.missions.adventure.description) {
    return metrics.missions.adventure.description;
  }
  const secondMission = metrics.missions.dailyMissionSet.missions[1];
  if (secondMission?.description) {
    return secondMission.description;
  }
  if (metrics.nextSteps[1]?.description) {
    return metrics.nextSteps[1].description;
  }
  return selectDailyCoach(metrics);
}

export function selectBossBattleStep(metrics: MemberComputedMetrics): NextStep | null {
  return (
    metrics.nextSteps.find((step) => step.stepKey.includes("world_team")) ??
    metrics.nextSteps.find((step) => step.stepKey.includes("map_")) ??
    metrics.nextSteps[0] ??
    null
  );
}

export function selectCurrentAdventureStep(
  steps: AdventureStep[],
): AdventureStep | null {
  return steps.find((step) => step.status === "in_progress") ?? null;
}

export function selectNextAdventureStep(
  steps: AdventureStep[],
): AdventureStep | null {
  const current = selectCurrentAdventureStep(steps);
  if (!current) {
    return steps.find((step) => step.status === "locked") ?? null;
  }
  return (
    steps.find(
      (step) => step.order === current.order + 1 && step.status !== "completed",
    ) ?? null
  );
}

export function selectTodayAchievements(
  metrics: MemberComputedMetrics,
  referenceDate: string,
): Achievement[] {
  return metrics.gamification.achievements.filter(
    (achievement) => achievement.unlockedAt === referenceDate,
  );
}

export function selectTodayBadges(
  metrics: MemberComputedMetrics,
  referenceDate: string,
): Badge[] {
  return metrics.gamification.badges.filter(
    (badge) => badge.earnedAt === referenceDate,
  );
}

/** Sum XP from today's achievements only — no fallback inference. */
export function sumTodayXp(achievements: Achievement[]): number {
  return achievements.reduce((sum, item) => sum + item.rewardXP, 0);
}

export function hasRuleMissing(
  metrics: MemberComputedMetrics,
  ruleKeyFragment: string,
): boolean {
  return metrics.ruleMissing.entries.some((entry) =>
    entry.ruleKey.includes(ruleKeyFragment),
  );
}

export function shouldShowBossRuleMissing(metrics: MemberComputedMetrics): boolean {
  if (selectBossBattleStep(metrics)) {
    return false;
  }

  return (
    hasRuleMissing(metrics, "nextSteps.world_team_vp") ||
    hasRuleMissing(metrics, "nextSteps.map_milestone") ||
    hasRuleMissing(metrics, "presidentTree.totalLines")
  );
}

export function shouldShowMissionRuleMissing(metrics: MemberComputedMetrics): boolean {
  if (metrics.missions.dailyMissionSet.missions.length > 0) {
    return false;
  }

  return (
    hasRuleMissing(metrics, "streakMaintain.dailyTarget") ||
    hasRuleMissing(metrics, "monthlyChallengeMission.overallTarget") ||
    hasRuleMissing(metrics, "nextSteps.") ||
    hasRuleMissing(metrics, "monthlyChallenge.") ||
    hasRuleMissing(metrics, "adventure.")
  );
}

export function shouldShowAdventureRuleMissing(metrics: MemberComputedMetrics): boolean {
  if (metrics.missions.adventure.steps.length > 0) {
    return false;
  }

  return hasRuleMissing(metrics, "adventure.");
}
