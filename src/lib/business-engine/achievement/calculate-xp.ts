import type { Achievement, Xp } from "@/types/gamification";
import type { GamificationEvent } from "@/types/gamification";
import type { BusinessRulesConfig } from "../rules";
import { DEFAULT_BUSINESS_RULES } from "../rules";

function resolveEventXP(
  event: GamificationEvent,
  rules: BusinessRulesConfig,
): number {
  const reward = rules.gamification.xp.eventRewards.find(
    (item) => item.eventSource === event.eventSource && item.eventKey === event.eventKey,
  );

  return reward?.xp ?? 0;
}

function resolveLevel(totalXP: number, rules: BusinessRulesConfig) {
  const levels = [...rules.gamification.levels].sort(
    (left, right) => right.xpRequired - left.xpRequired,
  );

  const current =
    levels.find((level) => totalXP >= level.xpRequired) ?? levels[levels.length - 1];
  const currentIndex = levels.findIndex((level) => level.level === current.level);
  const next = levels[currentIndex - 1] ?? current;

  return {
    level: current.level,
    levelLabel: current.label,
    currentLevelXP: current.xpRequired,
    nextLevelXP: next.xpRequired,
    xpToNextLevel: Math.max(0, next.xpRequired - totalXP),
  };
}

export function calculateXp(
  memberId: string,
  events: GamificationEvent[],
  achievements: Achievement[],
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): Xp {
  const eventXP = events.reduce(
    (sum, event) => sum + resolveEventXP(event, rules),
    0,
  );
  const achievementXP = achievements.reduce(
    (sum, achievement) => sum + achievement.rewardXP,
    0,
  );
  const totalXP = eventXP + achievementXP;
  const levelInfo = resolveLevel(totalXP, rules);

  return {
    memberId,
    eventXP,
    achievementXP,
    totalXP,
    ...levelInfo,
  };
}
