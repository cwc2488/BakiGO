/**
 * Gamification rules — achievements, badges, XP, streak, levels.
 * Source of truth for all gamification logic; UI must not hardcode rules.
 */

import {
  ACTIVITY_KEYS,
  RANK_KEYS,
  RETAIL_TRANSACTION_TYPE_KEYS,
} from "./keys";

/** Event sources that can trigger achievements and award XP. */
export const GAMIFICATION_EVENT_SOURCES = {
  MEASUREMENT: "measurement",
  CONSULTATION: "consultation",
  PRODUCT_SHARING: "product_sharing",
  TRANSACTION: "transaction",
  MAP: "map",
  VP: "vp",
  ACTIVE: "active",
  RANK_PROMOTION: "rank_promotion",
  MONTHLY_CHALLENGE: "monthly_challenge",
} as const;

export const ACHIEVEMENT_TRIGGER_TYPES = {
  COUNT: "count",
  TOTAL: "total",
  THRESHOLD: "threshold",
} as const;

export interface XpEventRewardRule {
  eventSource: string;
  eventKey: string;
  xp: number;
}

export interface LevelRule {
  level: number;
  label: string;
  xpRequired: number;
}

export interface AchievementRule {
  achievementKey: string;
  eventSource: string;
  triggerType: string;
  /** Activity key, transaction type, rank key, or milestone identifier. */
  eventKey?: string;
  /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
  threshold: number | null;
  rewardXP: number;
  badgeKey?: string;
  titleTemplate: string;
  descriptionTemplate: string;
}

export interface BadgeRule {
  badgeKey: string;
  label: string;
  iconKey: string;
  /** When set, badge is awarded alongside this achievement. */
  linkedAchievementKey?: string;
  /** Standalone badge with its own trigger — mirrors achievement trigger shape. */
  eventSource?: string;
  triggerType?: string;
  eventKey?: string;
  threshold?: number | null;
}

export interface StreakRules {
  qualifyingEventSources: string[];
}

export interface GamificationRulesConfig {
  xp: {
    eventRewards: XpEventRewardRule[];
  };
  levels: LevelRule[];
  streak: StreakRules;
  achievements: AchievementRule[];
  badges: BadgeRule[];
}

export const DEFAULT_GAMIFICATION_RULES: GamificationRulesConfig = {
  xp: {
    eventRewards: [
      {
        eventSource: GAMIFICATION_EVENT_SOURCES.MEASUREMENT,
        eventKey: ACTIVITY_KEYS.MEASUREMENT,
        xp: 10,
      },
      {
        eventSource: GAMIFICATION_EVENT_SOURCES.CONSULTATION,
        eventKey: ACTIVITY_KEYS.CONSULTATION,
        xp: 12,
      },
      {
        eventSource: GAMIFICATION_EVENT_SOURCES.PRODUCT_SHARING,
        eventKey: ACTIVITY_KEYS.PRODUCT_SHARING,
        xp: 8,
      },
      {
        eventSource: GAMIFICATION_EVENT_SOURCES.TRANSACTION,
        eventKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        xp: 15,
      },
      {
        eventSource: GAMIFICATION_EVENT_SOURCES.TRANSACTION,
        eventKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
        xp: 10,
      },
      {
        eventSource: GAMIFICATION_EVENT_SOURCES.TRANSACTION,
        eventKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        xp: 20,
      },
      {
        eventSource: GAMIFICATION_EVENT_SOURCES.TRANSACTION,
        eventKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
        xp: 15,
      },
    ],
  },
  levels: [
    { level: 1, label: "Lv.1", xpRequired: 0 },
    { level: 2, label: "Lv.2", xpRequired: 100 },
    { level: 3, label: "Lv.3", xpRequired: 250 },
    { level: 4, label: "Lv.4", xpRequired: 500 },
    { level: 5, label: "Lv.5", xpRequired: 1000 },
  ],
  streak: {
    qualifyingEventSources: [
      GAMIFICATION_EVENT_SOURCES.MEASUREMENT,
      GAMIFICATION_EVENT_SOURCES.CONSULTATION,
      GAMIFICATION_EVENT_SOURCES.PRODUCT_SHARING,
      GAMIFICATION_EVENT_SOURCES.TRANSACTION,
    ],
  },
  achievements: [
    {
      achievementKey: "first_measurement",
      eventSource: GAMIFICATION_EVENT_SOURCES.MEASUREMENT,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.COUNT,
      eventKey: ACTIVITY_KEYS.MEASUREMENT,
      threshold: null,
      rewardXP: 25,
      badgeKey: "badge_first_measurement",
      titleTemplate: "首次量測",
      descriptionTemplate: "完成第 {threshold} 次量測",
    },
    {
      achievementKey: "measurement_10",
      eventSource: GAMIFICATION_EVENT_SOURCES.MEASUREMENT,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.COUNT,
      eventKey: ACTIVITY_KEYS.MEASUREMENT,
      threshold: null,
      rewardXP: 50,
      badgeKey: "badge_measurement_10",
      titleTemplate: "量測達人",
      descriptionTemplate: "累積 {threshold} 次量測",
    },
    {
      achievementKey: "first_transaction",
      eventSource: GAMIFICATION_EVENT_SOURCES.TRANSACTION,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.COUNT,
      threshold: null,
      rewardXP: 30,
      badgeKey: "badge_first_sale",
      titleTemplate: "首筆成交",
      descriptionTemplate: "完成第 {threshold} 筆成交",
    },
    {
      achievementKey: "transaction_10",
      eventSource: GAMIFICATION_EVENT_SOURCES.TRANSACTION,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.COUNT,
      threshold: null,
      rewardXP: 60,
      badgeKey: "badge_sales_10",
      titleTemplate: "成交高手",
      descriptionTemplate: "累積 {threshold} 筆成交",
    },
    {
      achievementKey: "vp_100",
      eventSource: GAMIFICATION_EVENT_SOURCES.VP,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.TOTAL,
      threshold: null,
      rewardXP: 40,
      badgeKey: "badge_vp_100",
      titleTemplate: "VP 破百",
      descriptionTemplate: "本月 VP 達 {threshold}",
    },
    {
      achievementKey: "map_5_lines",
      eventSource: GAMIFICATION_EVENT_SOURCES.MAP,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.THRESHOLD,
      threshold: null,
      rewardXP: 45,
      badgeKey: "badge_map_5",
      titleTemplate: "MAP 五線",
      descriptionTemplate: "活躍線達 {threshold} 條",
    },
    {
      achievementKey: "active_supervisor",
      eventSource: GAMIFICATION_EVENT_SOURCES.ACTIVE,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.THRESHOLD,
      eventKey: RANK_KEYS.ACTIVE_SUPERVISOR,
      threshold: null,
      rewardXP: 80,
      badgeKey: "badge_active_supervisor",
      titleTemplate: "活躍督導",
      descriptionTemplate: "晉升為 {rankLabel}",
    },
    {
      achievementKey: "rank_supervisor",
      eventSource: GAMIFICATION_EVENT_SOURCES.RANK_PROMOTION,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.THRESHOLD,
      eventKey: RANK_KEYS.SUPERVISOR,
      threshold: null,
      rewardXP: 100,
      badgeKey: "badge_supervisor",
      titleTemplate: "晉升督導",
      descriptionTemplate: "達成 {rankLabel} 資格",
    },
    {
      achievementKey: "rank_world_team",
      eventSource: GAMIFICATION_EVENT_SOURCES.RANK_PROMOTION,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.THRESHOLD,
      eventKey: RANK_KEYS.WORLD_TEAM,
      threshold: null,
      rewardXP: 200,
      badgeKey: "badge_world_team",
      titleTemplate: "晉升環球團隊",
      descriptionTemplate: "達成 {rankLabel} 資格",
    },
    {
      achievementKey: "streak_7",
      eventSource: GAMIFICATION_EVENT_SOURCES.MEASUREMENT,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.THRESHOLD,
      eventKey: "streak_days",
      threshold: null,
      rewardXP: 35,
      badgeKey: "badge_streak_7",
      titleTemplate: "七日連續",
      descriptionTemplate: "連續 {threshold} 天保持活躍",
    },
    {
      achievementKey: "monthly_challenge_80",
      eventSource: GAMIFICATION_EVENT_SOURCES.MONTHLY_CHALLENGE,
      triggerType: ACHIEVEMENT_TRIGGER_TYPES.THRESHOLD,
      threshold: null,
      rewardXP: 55,
      badgeKey: "badge_monthly_80",
      titleTemplate: "本月挑戰 80%",
      descriptionTemplate: "本月挑戰進度達 {threshold}%",
    },
  ],
  badges: [
    {
      badgeKey: "badge_first_measurement",
      label: "首次量測",
      iconKey: "measurement",
      linkedAchievementKey: "first_measurement",
    },
    {
      badgeKey: "badge_measurement_10",
      label: "量測達人",
      iconKey: "measurement_gold",
      linkedAchievementKey: "measurement_10",
    },
    {
      badgeKey: "badge_first_sale",
      label: "首筆成交",
      iconKey: "sale",
      linkedAchievementKey: "first_transaction",
    },
    {
      badgeKey: "badge_sales_10",
      label: "成交高手",
      iconKey: "sale_gold",
      linkedAchievementKey: "transaction_10",
    },
    {
      badgeKey: "badge_vp_100",
      label: "VP 破百",
      iconKey: "vp",
      linkedAchievementKey: "vp_100",
    },
    {
      badgeKey: "badge_map_5",
      label: "MAP 五線",
      iconKey: "map",
      linkedAchievementKey: "map_5_lines",
    },
    {
      badgeKey: "badge_active_supervisor",
      label: "活躍督導",
      iconKey: "active",
      linkedAchievementKey: "active_supervisor",
    },
    {
      badgeKey: "badge_supervisor",
      label: "督導",
      iconKey: "rank",
      linkedAchievementKey: "rank_supervisor",
    },
    {
      badgeKey: "badge_world_team",
      label: "環球團隊",
      iconKey: "rank_gold",
      linkedAchievementKey: "rank_world_team",
    },
    {
      badgeKey: "badge_streak_7",
      label: "七日連續",
      iconKey: "streak",
      linkedAchievementKey: "streak_7",
    },
    {
      badgeKey: "badge_monthly_80",
      label: "本月 80%",
      iconKey: "challenge",
      linkedAchievementKey: "monthly_challenge_80",
    },
  ],
};
