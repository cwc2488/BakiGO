import type { EntityId, ISODateString, Timestamp } from "./common";

/**
 * Normalized gamification event — derived from activities, transactions, and rank changes.
 * Immutable source input for XP, streak, and achievement evaluation.
 */
export interface GamificationEvent {
  id: string;
  memberId: EntityId;
  /** e.g. measurement, transaction, map, vp, active, rank_promotion */
  eventSource: string;
  /** e.g. activity key, transaction type key, rank key */
  eventKey: string;
  eventDate: ISODateString;
  value: number;
  createdAt: Timestamp;
}

/** Achievement definition key — rules live in business-engine config. */
export type AchievementKey = string;

/** Badge definition key — rules live in business-engine config. */
export type BadgeKey = string;

/**
 * Computed earned achievement — never store editable totals; derive at read time.
 */
export interface Achievement {
  achievementKey: AchievementKey;
  title: string;
  description: string;
  eventSource: string;
  unlockedAt: ISODateString;
  rewardXP: number;
  badgeKey?: BadgeKey;
}

/**
 * Computed earned badge — derived from achievements or standalone badge rules.
 */
export interface Badge {
  badgeKey: BadgeKey;
  label: string;
  iconKey: string;
  earnedAt: ISODateString;
  linkedAchievementKey?: AchievementKey;
}

/** Computed XP state for a member. */
export interface Xp {
  memberId: EntityId;
  eventXP: number;
  achievementXP: number;
  totalXP: number;
  level: number;
  levelLabel: string;
  currentLevelXP: number;
  nextLevelXP: number;
  xpToNextLevel: number;
}

/** Computed streak state for a member. */
export interface Streak {
  memberId: EntityId;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: ISODateString | null;
  isActiveToday: boolean;
}

/** Full Achievement Engine output — UI reads this only. */
export interface AchievementEngineResult {
  memberId: EntityId;
  referenceDate: ISODateString;
  xp: Xp;
  streak: Streak;
  badges: Badge[];
  achievements: Achievement[];
  qualifiedRankKeys: string[];
  computedAt: Timestamp;
}
