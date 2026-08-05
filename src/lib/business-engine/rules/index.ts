/**
 * Central business rules configuration.
 *
 * Source of truth: docs/BUSINESS_RULES.md
 * Change rules here (or inject overrides) — never scatter logic across callers.
 */

import { DEFAULT_GAMIFICATION_RULES } from "./gamification";
import type { GamificationRulesConfig } from "./gamification";
import { DEFAULT_PROMOTION_TREE, type PromotionTree } from "./promotion";
import { DEFAULT_QUALIFICATION_RULES, type QualificationRulesConfig } from "./qualification";
import { DEFAULT_SUPER_LEAGUE_RULES, type SuperLeagueRules } from "./super-league";
import { DEFAULT_VP_RULES, VP_TARGET_KEYS, type VpRulesConfig } from "./vp";
import {
  ACTIVITY_KEYS,
  LEADERBOARD_METRICS,
  RANK_KEYS,
  RETAIL_TRANSACTION_TYPE_KEYS,
} from "./keys";

export {
  RANK_KEYS,
  ACTIVITY_KEYS,
  RETAIL_TRANSACTION_TYPE_KEYS,
  LEADERBOARD_METRICS,
} from "./keys";

export interface RankQualificationCriterion {
  criterionKey: string;
  /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
  targetValue: number | null;
  weight?: number;
}

export interface RankQualificationRule {
  rankKey: string;
  label: string;
  criteria: RankQualificationCriterion[];
}

export interface PresidentTreeRules {
  /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
  totalLines: number | null;
  /** Downline member rank keys that mark a line as active. */
  activeRankKeys: string[];
  /** Optional minimum activity count within the period. 0 = rank check only. */
  minActivityCount: number;
  activityKeys: string[];
}

export interface PresidentLifetimeGoals {
  /** 只吃不做的客人 — lifetime target for 總裁組. */
  passiveCustomerTarget: number;
}

export interface RetailHouseRules {
  /** Activity key that counts as a retail house update. */
  updateActivityKey: string;
}

export interface RetailTransactionTypeConfig {
  key: string;
  label: string;
  valueUnit: "NTD" | "VP";
  currencyCode: string;
  /** Counts toward this monthly challenge criterion when a transaction is logged. */
  criterionKey: string;
}

export type VpRules = VpRulesConfig;

export interface MonthlyChallengeTemplate {
  title: string;
  criteria: Array<{
    criterionKey: string;
    label: string;
    /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
    targetValue: number | null;
    unit?: string;
    weight?: number;
  }>;
}

export interface LeaderboardRules {
  defaultMetricKey: string;
  limit: number;
}

export interface LeaderForestRules {
  /** Days without activity before flagging needsHelp. */
  inactiveDaysThreshold: number;
  /** Period-over-period increase (%) for improving signal. */
  improvingPercentThreshold: number;
  /** Period-over-period decrease (%) for fallingBehind signal. */
  fallingBehindPercentThreshold: number;
  /** Monthly challenge progress (%) for deservesRecognition. */
  recognitionMinProgressPercent: number;
}

export interface NextStepTemplateRule {
  stepKey: string;
  priority: number;
  rewardXP: number;
  titleTemplate: string;
  descriptionTemplate: string;
}

export interface NextStepVpRankRule extends NextStepTemplateRule {
  rankKey: string;
  /** Legacy inline target — prefer vpTargetKey from VP Rules. */
  vpTarget: number | null;
  /** References VP Rule target — required for VP next steps. */
  vpTargetKey?: string | null;
  unit: string;
}

export interface MonthlyChallengeTemplate {
  title: string;
  criteria: Array<{
    criterionKey: string;
    label: string;
    /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
    targetValue: number | null;
    unit?: string;
    weight?: number;
  }>;
}

export interface NextStepMapRule extends NextStepTemplateRule {
  /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
  targetActiveLines: number | null;
  milestoneLabel: string;
  unit: string;
}

export interface NextStepDailyActivityRule extends NextStepTemplateRule {
  activityKey: string;
  activityLabel: string;
  /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
  dailyTarget: number | null;
  unit: string;
}

export interface NextStepMonthlyCriterionRule extends NextStepTemplateRule {
  enabled: boolean;
  unit: string;
}

export interface NextStepRulesConfig {
  vpRankSteps: NextStepVpRankRule[];
  mapSteps: NextStepMapRule[];
  dailyActivitySteps: NextStepDailyActivityRule[];
  monthlyCriterionStep: NextStepMonthlyCriterionRule;
}

export interface BusinessRulesConfig {
  ranks: {
    order: string[];
    labels: Record<string, string>;
  };
  presidentTree: PresidentTreeRules;
  presidentLifetimeGoals: PresidentLifetimeGoals;
  superLeague: SuperLeagueRules;
  rankQualification: Record<string, RankQualificationRule>;
  retailHouse: RetailHouseRules;
  retailTransactionTypes: RetailTransactionTypeConfig[];
  vp: VpRules;
  monthlyChallenge: MonthlyChallengeTemplate;
  nextSteps: NextStepRulesConfig;
  gamification: GamificationRulesConfig;
  leaderboard: LeaderboardRules;
  leaderForest: LeaderForestRules;
  promotion: PromotionTree;
  qualification: QualificationRulesConfig;
}

export const DEFAULT_BUSINESS_RULES: BusinessRulesConfig = {
  ranks: {
    order: [
      RANK_KEYS.NEW_MEMBER,
      RANK_KEYS.SUPERVISOR,
      RANK_KEYS.ACTIVE_SUPERVISOR,
      RANK_KEYS.WORLD_TEAM,
      RANK_KEYS.PRESIDENT,
    ],
    labels: {
      [RANK_KEYS.NEW_MEMBER]: "新夥伴",
      [RANK_KEYS.SUPERVISOR]: "督導",
      [RANK_KEYS.ACTIVE_SUPERVISOR]: "活躍督導",
      [RANK_KEYS.WORLD_TEAM]: "世界組",
      [RANK_KEYS.PRESIDENT]: "總裁",
    },
  },
  presidentTree: {
    totalLines: 14,
    activeRankKeys: [RANK_KEYS.ACTIVE_SUPERVISOR],
    minActivityCount: 0,
    activityKeys: Object.values(ACTIVITY_KEYS),
  },
  presidentLifetimeGoals: {
    passiveCustomerTarget: 50,
  },
  superLeague: DEFAULT_SUPER_LEAGUE_RULES,
  rankQualification: {
    [RANK_KEYS.NEW_MEMBER]: {
      rankKey: RANK_KEYS.NEW_MEMBER,
      label: "新夥伴",
      criteria: [
        {
          criterionKey: ACTIVITY_KEYS.MEASUREMENT,
          targetValue: 30,
          weight: 1,
        },
        {
          criterionKey: ACTIVITY_KEYS.CONSULTATION,
          targetValue: 7,
          weight: 1,
        },
      ],
    },
    [RANK_KEYS.SUPERVISOR]: {
      rankKey: RANK_KEYS.SUPERVISOR,
      label: "督導",
      criteria: [
        { criterionKey: ACTIVITY_KEYS.MEASUREMENT, targetValue: 30, weight: 1 },
        { criterionKey: ACTIVITY_KEYS.CONSULTATION, targetValue: 7, weight: 1 },
      ],
    },
    [RANK_KEYS.WORLD_TEAM]: {
      rankKey: RANK_KEYS.WORLD_TEAM,
      label: "世界組",
      criteria: [
        { criterionKey: ACTIVITY_KEYS.MEASUREMENT, targetValue: null, weight: 1 },
        { criterionKey: ACTIVITY_KEYS.CONSULTATION, targetValue: null, weight: 1 },
        { criterionKey: ACTIVITY_KEYS.RETAIL_HOUSE_UPDATE, targetValue: null, weight: 1 },
      ],
    },
  },
  retailHouse: {
    updateActivityKey: ACTIVITY_KEYS.RETAIL_HOUSE_UPDATE,
  },
  retailTransactionTypes: [
    {
      key: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
      label: "新顧客（NT$）",
      valueUnit: "NTD",
      currencyCode: "TWD",
      criterionKey: "retail_new_customer_ntd",
    },
    {
      key: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
      label: "舊顧客（NT$）",
      valueUnit: "NTD",
      currencyCode: "TWD",
      criterionKey: "retail_returning_customer_ntd",
    },
    {
      key: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
      label: "新會員（VP）",
      valueUnit: "VP",
      currencyCode: "VP",
      criterionKey: "retail_new_member_vp",
    },
    {
      key: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
      label: "舊會員（VP）",
      valueUnit: "VP",
      currencyCode: "VP",
      criterionKey: "retail_returning_member_vp",
    },
  ],
  vp: DEFAULT_VP_RULES,
  monthlyChallenge: {
    title: "本月挑戰",
    criteria: [
      {
        criterionKey: ACTIVITY_KEYS.MEASUREMENT,
        label: "量測",
        targetValue: 30,
        unit: "次",
        weight: 1,
      },
      {
        criterionKey: ACTIVITY_KEYS.CONSULTATION,
        label: "諮詢新會員",
        targetValue: 7,
        unit: "次",
        weight: 1,
      },
      {
        criterionKey: "retail_new_customer_ntd",
        label: "新顧客成交",
        targetValue: null,
        unit: "次",
        weight: 1,
      },
      {
        criterionKey: "retail_returning_customer_ntd",
        label: "舊顧客成交",
        targetValue: null,
        unit: "次",
        weight: 1,
      },
      {
        criterionKey: "retail_new_member_vp",
        label: "新會員 VP",
        targetValue: null,
        unit: "VP",
        weight: 1,
      },
      {
        criterionKey: "retail_returning_member_vp",
        label: "舊會員 VP",
        targetValue: null,
        unit: "VP",
        weight: 1,
      },
    ],
  },
  nextSteps: {
    vpRankSteps: [
      {
        stepKey: "world_team_vp",
        rankKey: RANK_KEYS.WORLD_TEAM,
        vpTarget: null,
        vpTargetKey: VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_PERSONAL,
        unit: "VP",
        priority: 1,
        rewardXP: 50,
        titleTemplate: "距離{rankLabel}還差{remaining}{unit}",
        descriptionTemplate: "目前已累積 {current} {unit}，目標 {target} {unit}",
      },
    ],
    mapSteps: [
      {
        stepKey: "map_milestone",
        targetActiveLines: 14,
        milestoneLabel: "14 條活躍督導",
        unit: "條",
        priority: 2,
        rewardXP: 40,
        titleTemplate: "距離{milestoneLabel}還差{remaining}{unit}",
        descriptionTemplate: "目前已有 {current} 條活躍督導線，目標 {target} 條",
      },
    ],
    dailyActivitySteps: [
      {
        stepKey: "daily_consultation",
        activityKey: ACTIVITY_KEYS.CONSULTATION,
        activityLabel: "諮詢",
        dailyTarget: null,
        unit: "位",
        priority: 3,
        rewardXP: 20,
        titleTemplate: "今天還需要{activityLabel}{remaining}{unit}",
        descriptionTemplate: "今日已完成 {current} / {target} {unit}",
      },
      {
        stepKey: "daily_measurement",
        activityKey: ACTIVITY_KEYS.MEASUREMENT,
        activityLabel: "量測",
        dailyTarget: null,
        unit: "位",
        priority: 4,
        rewardXP: 15,
        titleTemplate: "今天還需要{activityLabel}{remaining}{unit}",
        descriptionTemplate: "今日已完成 {current} / {target} {unit}",
      },
    ],
    monthlyCriterionStep: {
      stepKey: "monthly_criterion",
      enabled: true,
      unit: "次",
      priority: 5,
      rewardXP: 10,
      titleTemplate: "本月{milestoneLabel}還差{remaining}{unit}",
      descriptionTemplate: "目前 {current} / {target} {unit}",
    },
  },
  gamification: DEFAULT_GAMIFICATION_RULES,
  leaderboard: {
    defaultMetricKey: LEADERBOARD_METRICS.MONTHLY_CHALLENGE_PROGRESS,
    limit: 50,
  },
  leaderForest: {
    inactiveDaysThreshold: 7,
    improvingPercentThreshold: 20,
    fallingBehindPercentThreshold: -20,
    recognitionMinProgressPercent: 80,
  },
  promotion: DEFAULT_PROMOTION_TREE,
  qualification: DEFAULT_QUALIFICATION_RULES,
};

export { DEFAULT_GAMIFICATION_RULES, GAMIFICATION_EVENT_SOURCES } from "./gamification";
export type { GamificationRulesConfig, AchievementRule, BadgeRule } from "./gamification";
export {
  DEFAULT_PROMOTION_TREE,
  MEMBER_RANK_TO_PROMOTION_RANK,
  PROMOTION_RANK_IDS,
  resolvePromotionRankId,
} from "./promotion";
export type {
  PromotionAchievementTemplates,
  PromotionAdventureTemplates,
  PromotionMissionTemplates,
  PromotionNextStepTemplates,
  PromotionRank,
  PromotionRankId,
  PromotionRequirement,
  PromotionRule,
  PromotionTree,
} from "./promotion";
export {
  DEFAULT_SUPER_LEAGUE_RULES,
} from "./super-league";
export type { SuperLeagueRules } from "./super-league";
export {
  DEFAULT_VP_RULES,
  VP_BUCKET_KEYS,
  VP_TARGET_KEYS,
  resolveVpTargetAmount,
  getVpSourceForTransactionType,
} from "./vp";
export type { VpRulesConfig } from "./vp";
export {
  DEFAULT_QUALIFICATION_RULES,
  QUALIFICATION_METRICS,
  QUALIFICATION_OPERATORS,
} from "./qualification";
export type {
  QualificationCondition,
  QualificationCompositeCondition,
  QualificationLeafCondition,
  QualificationRule,
  QualificationRulesConfig,
  QualificationMetricKey,
  QualificationOperatorKey,
} from "./qualification";
