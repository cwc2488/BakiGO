import type { CoachingDailyGenerationOutputJson, CoachingInterventionLevel } from "@/types/coaching-ai";

export type CoachingAiQualityCheckItem = {
  id: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type CoachingAiQualityReport = {
  customer: CoachingAiQualityCheckItem[];
  coach: CoachingAiQualityCheckItem[];
  overall: "pass" | "warn" | "fail";
};

const FOOD_POLICE_PATTERNS = [
  /不可以吃/,
  /不該吃/,
  /罪惡/,
  /太差了/,
  /很糟糕/,
  /不合格/,
  /懲罰/,
];

const CALORIE_PATTERNS = [/kcal/i, /大卡/, /卡路里/, /calorie/i, /宏量/, /蛋白質\s*\d+\s*g/];

const PRODUCT_CHANGE_PATTERNS = [/改喝別的產品/, /換成其他品牌/, /停止奶昔/, /不要再用產品/];

function checkEncouragementFirst(text: string): CoachingAiQualityCheckItem {
  const encouraging = /(很好|不错|不錯|棒|加油|持續|有回報|有做到|先肯定|值得肯定|辛苦了)/.test(text);
  return {
    id: "customer_encouragement_first",
    status: encouraging ? "pass" : "warn",
    detail: encouraging ? "Opening includes supportive tone." : "Missing clear encouragement in opening.",
  };
}

function checkNotFoodPolice(text: string): CoachingAiQualityCheckItem {
  const hit = FOOD_POLICE_PATTERNS.find((pattern) => pattern.test(text));
  return {
    id: "customer_not_food_police",
    status: hit ? "fail" : "pass",
    detail: hit ? `Possible food-police phrasing: ${hit.source}` : "No harsh blame phrasing detected.",
  };
}

function checkPriorAiAsFact(output: CoachingDailyGenerationOutputJson, priorTomorrowFocus: string | null): CoachingAiQualityCheckItem {
  if (!priorTomorrowFocus) {
    return { id: "prior_ai_not_fact", status: "pass", detail: "No prior AI context in fixture." };
  }
  const claimedDone = /(你有做到|確實完成|如昨天所說)/.test(
    `${output.customer.today_feedback} ${output.customer.encouragement}`,
  );
  return {
    id: "prior_ai_not_fact",
    status: claimedDone ? "warn" : "pass",
    detail: claimedDone
      ? "May treat prior AI tomorrow_focus as verified without explicit evidence."
      : "No obvious prior-AI-as-fact claim.",
  };
}

export function evaluateCoachingAiOutputQuality(input: {
  output: CoachingDailyGenerationOutputJson;
  finalInterventionLevel: CoachingInterventionLevel;
  priorTomorrowFocus?: string | null;
}): CoachingAiQualityReport {
  const { output, finalInterventionLevel, priorTomorrowFocus = null } = input;
  const customerText = `${output.customer.encouragement} ${output.customer.today_feedback} ${output.customer.tomorrow_focus}`;

  const customer: CoachingAiQualityCheckItem[] = [
    checkEncouragementFirst(output.customer.encouragement),
    checkNotFoodPolice(customerText),
    {
      id: "customer_adjustment_priorities_count",
      status: output.customer.adjustment_priorities.length <= 2 ? "pass" : "fail",
      detail: `adjustment_priorities=${output.customer.adjustment_priorities.length}`,
    },
    {
      id: "customer_tomorrow_focus_single",
      status: output.customer.tomorrow_focus.trim().length > 0 ? "pass" : "fail",
      detail: "tomorrow_focus should be one concrete focus.",
    },
    {
      id: "customer_zh_tw_natural",
      status: /[\u4e00-\u9fff]/.test(customerText) ? "pass" : "warn",
      detail: "Traditional Chinese natural tone heuristic.",
    },
    {
      id: "customer_length",
      status: customerText.length <= 900 ? "pass" : "warn",
      detail: `customer text length=${customerText.length}`,
    },
    {
      id: "customer_no_calorie_macro",
      status: CALORIE_PATTERNS.some((p) => p.test(customerText)) ? "fail" : "pass",
      detail: "No calorie/macro estimation detected.",
    },
    {
      id: "customer_no_product_change",
      status: PRODUCT_CHANGE_PATTERNS.some((p) => p.test(customerText)) ? "fail" : "pass",
      detail: "No unauthorized product plan change detected.",
    },
    checkPriorAiAsFact(output, priorTomorrowFocus),
  ];

  const coach: CoachingAiQualityCheckItem[] = [
    {
      id: "coach_summary_concise",
      status: output.coach.daily_summary.length <= 280 ? "pass" : "warn",
      detail: `daily_summary length=${output.coach.daily_summary.length}`,
    },
    {
      id: "coach_recurring_has_evidence",
      status:
        output.coach.recurring_issue == null || output.coach.evidence.length > 0
          ? "pass"
          : "warn",
      detail: "recurring_issue should be backed by evidence when present.",
    },
    {
      id: "coach_attention_reason_observed",
      status:
        output.coach.attention_reason == null ||
        output.coach.evidence.some((item) => output.coach.attention_reason?.includes(item.slice(0, 6)) !== false)
          ? "pass"
          : "warn",
      detail: "attention_reason should reference observed facts.",
    },
    {
      id: "coach_proposed_intervention_reasonable",
      status: ["normal", "watch", "coach_attention"].includes(output.coach.proposed_intervention_level)
        ? "pass"
        : "fail",
      detail: `proposed=${output.coach.proposed_intervention_level}, final=${finalInterventionLevel}`,
    },
  ];

  const all = [...customer, ...coach];
  const overall = all.some((item) => item.status === "fail")
    ? "fail"
    : all.some((item) => item.status === "warn")
      ? "warn"
      : "pass";

  return { customer, coach, overall };
}

export function projectCoachingAiMonthlyCostUsd(costPerInferenceUsd: number | null) {
  if (costPerInferenceUsd == null) {
    return null;
  }

  const perCustomer30Days = costPerInferenceUsd * 30;
  return {
    perCustomer30DaysUsd: roundUsd(perCustomer30Days),
    per100CustomersMonthUsd: roundUsd(perCustomer30Days * 100),
    per1000CustomersMonthUsd: roundUsd(perCustomer30Days * 1000),
    per10000CustomersMonthUsd: roundUsd(perCustomer30Days * 10000),
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
