/**
 * Qualification Rules — 晉升資格制度
 *
 * Source of truth: docs/BUSINESS_RULES.md → Qualification Rules
 * All rank qualification logic uses this schema — never hardcode in engines or UI.
 */

import { PROMOTION_RANK_IDS, type PromotionRankId } from "./promotion";
import { VP_TARGET_KEYS } from "./vp";

/** Supported leaf metrics for qualification conditions. */
export const QUALIFICATION_METRICS = {
  VP: "vp",
  ORGANIZATION_VP: "organization_vp",
  ROLLING_MONTH: "rolling_month",
  CONSECUTIVE_MONTH: "consecutive_month",
  SUPERVISOR_COUNT: "supervisor_count",
  WORLD_TEAM_COUNT: "world_team_count",
  EXPANSION_TEAM_COUNT: "expansion_team_count",
  MILLIONAIRE_TEAM_COUNT: "millionaire_team_count",
  PRESIDENT_TEAM_COUNT: "president_team_count",
  MAP: "map",
  ACTIVE_LINE: "active_line",
  ACTIVITY: "activity",
} as const;

export type QualificationMetricKey =
  (typeof QUALIFICATION_METRICS)[keyof typeof QUALIFICATION_METRICS];

/** Logical operators for composite conditions. */
export const QUALIFICATION_OPERATORS = {
  AND: "and",
  OR: "or",
  NOT: "not",
  ANY: "any",
  ALL: "all",
} as const;

export type QualificationOperatorKey =
  (typeof QUALIFICATION_OPERATORS)[keyof typeof QUALIFICATION_OPERATORS];

export interface QualificationLeafCondition {
  kind: "leaf";
  conditionKey: string;
  metric: QualificationMetricKey;
  /**
   * Non-VP metrics only. VP / Organization VP must use vpTargetKey from VP Rules.
   * Null until defined — Priority 0.
   */
  target: number | null;
  /** References VP Rule target — required for VP / Organization VP metrics. */
  vpTargetKey?: string | null;
  activityKey?: string | null;
  /** For rolling_month / consecutive_month — condition evaluated each month. */
  monthExpression?: QualificationCondition | null;
  rollingWindowMonths?: number | null;
  labelTemplate: string;
  unit?: string;
}

export interface QualificationCompositeCondition {
  kind: "composite";
  conditionKey: string;
  operator: QualificationOperatorKey;
  conditions: QualificationCondition[];
  /** ANY operator — minimum children that must pass. Null until defined. */
  minSatisfied?: number | null;
  labelTemplate?: string;
}

export type QualificationCondition =
  | QualificationLeafCondition
  | QualificationCompositeCondition;

export interface QualificationRule {
  ruleKey: string;
  name: string;
  targetRankId: PromotionRankId;
  description: string;
  root: QualificationCondition;
}

export interface QualificationNextStepTemplates {
  titleTemplate: string;
  descriptionTemplate: string;
  priority: number;
  rewardXP: number | null;
}

export interface QualificationMissionTemplates {
  titleTemplate: string;
  subtitleTemplate: string;
  priority: number;
}

export interface QualificationRulesConfig {
  rules: Record<string, QualificationRule>;
  /** Maps promotion rankId → qualification ruleKey for rank entry. */
  rankEntryRuleKeys: Partial<Record<PromotionRankId, string>>;
  nextStepTemplates: QualificationNextStepTemplates;
  missionTemplates: QualificationMissionTemplates;
}

const worldTeamMonthlyVpOr: QualificationCompositeCondition = {
  kind: "composite",
  conditionKey: "world_team_monthly_vp_or",
  operator: QUALIFICATION_OPERATORS.OR,
  conditions: [
    {
      kind: "leaf",
      conditionKey: "world_team_month_personal_vp",
      metric: QUALIFICATION_METRICS.VP,
      target: null,
      vpTargetKey: VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_PERSONAL,
      labelTemplate: "個人 {target} VP",
      unit: "VP",
    },
    {
      kind: "leaf",
      conditionKey: "world_team_month_organization_vp",
      metric: QUALIFICATION_METRICS.ORGANIZATION_VP,
      target: null,
      vpTargetKey: VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_ORGANIZATION,
      labelTemplate: "組織 {target} VP",
      unit: "VP",
    },
  ],
};

export const DEFAULT_QUALIFICATION_RULES: QualificationRulesConfig = {
  rules: {
    qualification_world_team: {
      ruleKey: "qualification_world_team",
      name: "世界組資格",
      targetRankId: PROMOTION_RANK_IDS.WORLD_TEAM,
      description: "個人 VP 或 組織 VP 目標（見 VP Rules），連續四個月。",
      root: {
        kind: "composite",
        conditionKey: "world_team_qualification_root",
        operator: QUALIFICATION_OPERATORS.AND,
        conditions: [
          {
            kind: "composite",
            conditionKey: "world_team_current_vp_or",
            operator: QUALIFICATION_OPERATORS.OR,
            labelTemplate: "本月 VP 條件",
            conditions: [
              {
                kind: "leaf",
                conditionKey: "world_team_personal_vp",
                metric: QUALIFICATION_METRICS.VP,
                target: null,
                vpTargetKey: VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_PERSONAL,
                labelTemplate: "個人 {target} VP",
                unit: "VP",
              },
              {
                kind: "leaf",
                conditionKey: "world_team_organization_vp",
                metric: QUALIFICATION_METRICS.ORGANIZATION_VP,
                target: null,
                vpTargetKey: VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_ORGANIZATION,
                labelTemplate: "組織 {target} VP",
                unit: "VP",
              },
            ],
          },
          {
            kind: "leaf",
            conditionKey: "world_team_consecutive_months",
            metric: QUALIFICATION_METRICS.CONSECUTIVE_MONTH,
            target: 4,
            monthExpression: worldTeamMonthlyVpOr,
            labelTemplate: "連續 {target} 個月",
            unit: "月",
          },
        ],
      },
    },
  },
  rankEntryRuleKeys: {
    [PROMOTION_RANK_IDS.WORLD_TEAM]: "qualification_world_team",
  },
  nextStepTemplates: {
    titleTemplate: "距離{targetRankName}資格：{label}",
    descriptionTemplate:
      "目前 {current}{unit}，目標 {target}{unit}，尚差 {remaining}{unit}（{progressPercent}%）",
    priority: 0,
    rewardXP: null,
  },
  missionTemplates: {
    titleTemplate: "距離{targetRankName}資格：{label}",
    subtitleTemplate: "進度 {progressPercent}%",
    priority: 1,
  },
};
