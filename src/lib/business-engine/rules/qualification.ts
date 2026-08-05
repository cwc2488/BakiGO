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
  FIRST_GENERATION_COUNT: "first_generation_count",
  QUALIFIED_RECRUIT_COUNT: "qualified_recruit_count",
  WORLD_TEAM_COUNT: "world_team_count",
  EXPANSION_TEAM_COUNT: "expansion_team_count",
  MILLIONAIRE_TEAM_COUNT: "millionaire_team_count",
  PRESIDENT_TEAM_COUNT: "president_team_count",
  MAP: "map",
  ACTIVE_LINE: "active_line",
  ACTIVITY: "activity",
  MEETING_COUNT: "meeting_count",
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

const supervisorMonthlyVp: QualificationLeafCondition = {
  kind: "leaf",
  conditionKey: "supervisor_month_personal_vp",
  metric: QUALIFICATION_METRICS.VP,
  target: null,
  vpTargetKey: VP_TARGET_KEYS.SUPERVISOR_MONTHLY_PERSONAL,
  labelTemplate: "個人 {target} VP",
  unit: "VP",
};

const mapMonthlyVp: QualificationLeafCondition = {
  kind: "leaf",
  conditionKey: "map_month_personal_vp",
  metric: QUALIFICATION_METRICS.VP,
  target: null,
  vpTargetKey: VP_TARGET_KEYS.MAP_MONTHLY_PERSONAL,
  labelTemplate: "個人 {target} VP",
  unit: "VP",
};

export const DEFAULT_QUALIFICATION_RULES: QualificationRulesConfig = {
  rules: {
    qualification_supervisor: {
      ruleKey: "qualification_supervisor",
      name: "MAP 計劃 → 督導",
      targetRankId: PROMOTION_RANK_IDS.SUPERVISOR,
      description: "連續三個月 1000 VP、招募兩位達標會員，並參加 30 場 MAP 會議。",
      root: {
        kind: "composite",
        conditionKey: "supervisor_qualification_root",
        operator: QUALIFICATION_OPERATORS.AND,
        conditions: [
          {
            kind: "leaf",
            conditionKey: "map_consecutive_months",
            metric: QUALIFICATION_METRICS.CONSECUTIVE_MONTH,
            target: 3,
            monthExpression: mapMonthlyVp,
            labelTemplate: "連續 {target} 個月 1000 VP",
            unit: "月",
          },
          {
            kind: "leaf",
            conditionKey: "map_qualified_recruits",
            metric: QUALIFICATION_METRICS.QUALIFIED_RECRUIT_COUNT,
            target: 2,
            labelTemplate: "招募 {target} 位達標會員（一年內 4000 VP）",
            unit: "位",
          },
          {
            kind: "leaf",
            conditionKey: "map_meeting_attendance",
            metric: QUALIFICATION_METRICS.MEETING_COUNT,
            target: 30,
            labelTemplate: "參加 {target} 場 MAP 會議（目前 {current} 場）",
            unit: "場",
          },
        ],
      },
    },
    qualification_active_supervisor: {
      ruleKey: "qualification_active_supervisor",
      name: "活躍督導",
      targetRankId: PROMOTION_RANK_IDS.ACTIVE_SUPERVISOR,
      description: "督導連續三個月 2500 VP 以上。",
      root: {
        kind: "leaf",
        conditionKey: "active_supervisor_consecutive_months",
        metric: QUALIFICATION_METRICS.CONSECUTIVE_MONTH,
        target: 3,
        monthExpression: supervisorMonthlyVp,
        labelTemplate: "連續 {target} 個月 2500 VP",
        unit: "月",
      },
    },
    qualification_world_team: {
      ruleKey: "qualification_world_team",
      name: "世界組資格",
      targetRankId: PROMOTION_RANK_IDS.WORLD_TEAM,
      description: "督導連續四個月 2500 VP 以上。",
      root: {
        kind: "leaf",
        conditionKey: "world_team_consecutive_months",
        metric: QUALIFICATION_METRICS.CONSECUTIVE_MONTH,
        target: 4,
        monthExpression: supervisorMonthlyVp,
        labelTemplate: "連續 {target} 個月 2500 VP",
        unit: "月",
      },
    },
  },
  rankEntryRuleKeys: {
    [PROMOTION_RANK_IDS.SUPERVISOR]: "qualification_supervisor",
    [PROMOTION_RANK_IDS.ACTIVE_SUPERVISOR]: "qualification_active_supervisor",
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
