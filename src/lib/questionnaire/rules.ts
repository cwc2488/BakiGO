/**
 * 問卷開發 — business rule targets (Priority 0).
 * UI must render these from engine/service output; never hardcode KPIs in components.
 */

export const QUESTIONNAIRE_RULE_KEYS = {
  dailyValidNewLeads: "questionnaire.daily_valid_new_leads",
} as const;

/** Source of truth mirrors docs/BUSINESS_RULES.md «問卷開發». */
export const QUESTIONNAIRE_RULES = {
  timezone: "Asia/Taipei" as const,
  dailyValidNewLeadsTarget: 3,
  recentLeadsLimit: 5,
  leadsPageSize: 30,
  responseHistoryLimit: 5,
} as const;

export type QuestionnaireTargets = {
  dailyValidNewLeads: number;
};

export function resolveQuestionnaireTargets(): QuestionnaireTargets {
  return {
    dailyValidNewLeads: QUESTIONNAIRE_RULES.dailyValidNewLeadsTarget,
  };
}
