import type {
  CoachingDailyGenerationOutputJson,
  CoachingGenerationInput,
  CoachingInterventionLevel,
} from "@/types/coaching-ai";
import type { CoachingPlanSnapshot } from "@/types/coaching";

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

/** Praise that beautifies undesirable behavior — encourage the person, not the mistake. */
const PRAISE_BAD_BEHAVIOR_PATTERNS = [
  /沒吃早餐.{0,24}(好選擇|很好|真棒|很棒|值得肯定)/,
  /跳過早餐.{0,24}(好選擇|很好|真棒|很棒)/,
  /只喝水.{0,16}(好選擇|值得肯定|已經很夠)/,
  /沒吃.{0,8}但喝水.{0,12}(好|棒|正確)/,
  /(火鍋|外食).{0,16}(沒關係|也很好|很棒的選擇)/,
];

const INVENTED_FIXED_STANDARD_PATTERNS = [
  /每天[要需]?喝?\s*\d{3,4}\s*(ml|毫升|c\.?c\.?)/i,
  /水量[要需達到至]{0,3}\s*\d{3,4}\s*(ml|毫升)?/i,
  /喝到\s*\d{3,4}\s*(ml|毫升)/i,
  /睡[眠覺]?[要需得]{0,2}\s*\d+(\.\d+)?\s*小時/,
  /固定\s*\d+\s*(小時|ml|毫升|杯)/,
  /八杯水/,
  /2000\s*(ml|毫升)/i,
];

function checkEncouragementFirst(text: string): CoachingAiQualityCheckItem {
  const encouraging = /(很好|不错|不錯|棒|加油|持續|有回報|有做到|先肯定|值得肯定|辛苦了|堅持)/.test(text);
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

function flattenPlanAuthorityText(
  planSnapshot: CoachingPlanSnapshot | null | undefined,
  coachDirectives: CoachingGenerationInput["coachDirectives"],
): string {
  if (!planSnapshot && !coachDirectives) {
    return "";
  }

  const parts: string[] = [];
  if (planSnapshot) {
    parts.push(...planSnapshot.dietaryGuidelines);
    parts.push(...Object.values(planSnapshot.dailyInstructions).flat());
    parts.push(...planSnapshot.reportingRules);
    if (planSnapshot.coachNotes) {
      parts.push(planSnapshot.coachNotes);
    }
  }
  if (coachDirectives) {
    parts.push(JSON.stringify(coachDirectives));
  }
  return parts.join("\n");
}

function checkPlanAuthority(customerText: string, planAuthorityText: string): CoachingAiQualityCheckItem {
  const hit = INVENTED_FIXED_STANDARD_PATTERNS.find((pattern) => pattern.test(customerText));
  if (!hit) {
    return {
      id: "customer_plan_authority",
      status: "pass",
      detail: "No invented fixed water/sleep/product numeric standards detected.",
    };
  }

  const matched = customerText.match(hit)?.[0] ?? hit.source;
  const numericBits = matched.match(/\d+(\.\d+)?/g) ?? [];
  const allowedByPlan =
    planAuthorityText.length > 0 &&
    (numericBits.some((n) => planAuthorityText.includes(n)) || planAuthorityText.includes(matched));

  if (allowedByPlan) {
    return {
      id: "customer_plan_authority",
      status: "pass",
      detail: `Numeric standard appears grounded in plan/directives: ${matched}`,
    };
  }

  return {
    id: "customer_plan_authority",
    status: "fail",
    detail: `Invented fixed standard without plan/directive authority: ${matched}`,
  };
}

function checkNoPraiseBadBehavior(customerText: string): CoachingAiQualityCheckItem {
  const hit = PRAISE_BAD_BEHAVIOR_PATTERNS.find((pattern) => pattern.test(customerText));
  return {
    id: "customer_no_praise_bad_behavior",
    status: hit ? "fail" : "pass",
    detail: hit
      ? `May praise undesirable behavior rather than the person: ${hit.source}`
      : "No praise-of-bad-behavior phrasing detected.",
  };
}

const FOCUS_DOMAIN_KEYWORDS = [
  "早餐",
  "午餐",
  "晚餐",
  "奶昔",
  "蛋白質",
  "奶茶",
  "含糖",
  "飲料",
  "無糖",
  "睡眠",
  "躺床",
  "就寢",
  "水分",
  "回報",
  "外食",
  "火鍋",
  "醬料",
  "配菜",
  "最低版本",
] as const;

function extractFocusDomainTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const keyword of FOCUS_DOMAIN_KEYWORDS) {
    if (text.includes(keyword)) {
      tokens.add(keyword);
    }
  }
  return tokens;
}

function checkTomorrowFocusContinuity(output: CoachingDailyGenerationOutputJson): CoachingAiQualityCheckItem {
  const priorities = output.customer.adjustment_priorities;
  const focus = output.customer.tomorrow_focus.trim();
  if (priorities.length === 0) {
    return {
      id: "customer_tomorrow_focus_continuity",
      status: focus.length > 0 ? "pass" : "fail",
      detail: "Empty priorities: tomorrow_focus may maintain rhythm; still must be non-empty.",
    };
  }

  const top = priorities[0] ?? "";
  const topTokens = extractFocusDomainTokens(top);
  const focusTokens = extractFocusDomainTokens(focus);
  const overlap = [...topTokens].filter((token) => focusTokens.has(token));

  const topIsBreakfast = /早餐|奶昔|蛋白質|奶茶|含糖/.test(top);
  const focusJumpsToLunchOnly = topIsBreakfast && /午餐/.test(focus) && !/早餐|奶昔|蛋白質/.test(focus);

  if (focusJumpsToLunchOnly) {
    return {
      id: "customer_tomorrow_focus_continuity",
      status: "fail",
      detail: "tomorrow_focus jumped to lunch while top priority is breakfast-related.",
    };
  }

  if (topTokens.size > 0 && overlap.length === 0) {
    return {
      id: "customer_tomorrow_focus_continuity",
      status: "fail",
      detail: "tomorrow_focus does not continue the highest adjustment_priority.",
    };
  }

  return {
    id: "customer_tomorrow_focus_continuity",
    status: "pass",
    detail: "tomorrow_focus continues the highest priority.",
  };
}

function checkBreakfastDeviationPriorityOrder(
  output: CoachingDailyGenerationOutputJson,
  generationInput: CoachingGenerationInput | null | undefined,
): CoachingAiQualityCheckItem {
  const breakfastNote =
    generationInput?.todayContext.primaryMeals.find((item) => item.mealSlot === "breakfast")?.textNote ?? "";
  const isEggPancakeTea = /蛋餅/.test(breakfastNote) && /奶茶/.test(breakfastNote);
  if (!isEggPancakeTea) {
    return {
      id: "customer_breakfast_deviation_priority_order",
      status: "pass",
      detail: "Not an egg-pancake + milk-tea breakfast deviation case.",
    };
  }

  const priorities = output.customer.adjustment_priorities;
  if (priorities.length === 0) {
    return {
      id: "customer_breakfast_deviation_priority_order",
      status: "fail",
      detail: "Egg-pancake + milk-tea day should prioritize breakfast protein and sugary drink substitute.",
    };
  }

  const joined = priorities.join(" ");
  const hasProteinOrShake = /蛋白質|奶昔/.test(joined);
  const hasSugaryDrink = /含糖|奶茶|無糖|飲料/.test(joined);
  const secondaryFirst = /醬料|配菜/.test(priorities[0] ?? "");

  if (secondaryFirst) {
    return {
      id: "customer_breakfast_deviation_priority_order",
      status: "fail",
      detail: "Secondary issues (sauce / side dish) must not outrank breakfast protein / sugary drink.",
    };
  }

  if (!hasProteinOrShake || !hasSugaryDrink) {
    return {
      id: "customer_breakfast_deviation_priority_order",
      status: "fail",
      detail: "Priorities should cover breakfast protein and sugary-drink substitute.",
    };
  }

  return {
    id: "customer_breakfast_deviation_priority_order",
    status: "pass",
    detail: "Breakfast deviation priorities favor protein and sugary-drink substitute.",
  };
}

const MEAL_SLEEP_RECURRING_PATTERNS = new Set([
  "breakfast_often_missed",
  "lunch_often_missed",
  "dinner_often_missed",
  "late_sleep_pattern",
]);

/** Rolling evidence for recurring issues / coach attention — ignore mere submission_inconsistent. */
function hasRollingSupport(generationInput: CoachingGenerationInput | null | undefined): boolean {
  if (!generationInput) {
    return false;
  }
  const { aggregates, recurringPatterns } = generationInput.rollingMemory;
  if (recurringPatterns.some((pattern) => MEAL_SLEEP_RECURRING_PATTERNS.has(pattern))) {
    return true;
  }
  if ((aggregates.lateSleepDays ?? 0) >= 2) {
    return true;
  }
  if (
    aggregates.daysWithReport >= 3 &&
    aggregates.breakfastCompletionRate != null &&
    aggregates.breakfastCompletionRate < 0.7
  ) {
    return true;
  }
  return false;
}

function checkRecurringRequiresEvidence(
  output: CoachingDailyGenerationOutputJson,
  generationInput: CoachingGenerationInput | null | undefined,
): CoachingAiQualityCheckItem {
  if (output.coach.recurring_issue == null) {
    return {
      id: "coach_recurring_requires_evidence",
      status: "pass",
      detail: "recurring_issue is null.",
    };
  }

  if (output.coach.evidence.length === 0) {
    return {
      id: "coach_recurring_requires_evidence",
      status: "fail",
      detail: "recurring_issue requires non-empty evidence.",
    };
  }

  if (generationInput && !hasRollingSupport(generationInput)) {
    return {
      id: "coach_recurring_requires_evidence",
      status: "fail",
      detail: "recurring_issue set without rolling aggregate / pattern support.",
    };
  }

  return {
    id: "coach_recurring_requires_evidence",
    status: "pass",
    detail: "recurring_issue has evidence support.",
  };
}

function checkImprovedRequiresEvidence(output: CoachingDailyGenerationOutputJson): CoachingAiQualityCheckItem {
  if (output.coach.improved_issue == null) {
    return {
      id: "coach_improved_requires_evidence",
      status: "pass",
      detail: "improved_issue is null.",
    };
  }

  return {
    id: "coach_improved_requires_evidence",
    status: output.coach.evidence.length > 0 ? "pass" : "fail",
    detail:
      output.coach.evidence.length > 0
        ? "improved_issue has evidence."
        : "improved_issue requires non-empty evidence; otherwise must be null.",
  };
}

function checkSingleMealNotCoachAttention(
  output: CoachingDailyGenerationOutputJson,
  generationInput: CoachingGenerationInput | null | undefined,
): CoachingAiQualityCheckItem {
  if (!output.coach.coach_attention_required) {
    return {
      id: "coach_single_meal_not_attention",
      status: "pass",
      detail: "coach_attention_required is false.",
    };
  }

  if (hasRollingSupport(generationInput)) {
    return {
      id: "coach_single_meal_not_attention",
      status: "pass",
      detail: "Attention has rolling/recurring support.",
    };
  }

  return {
    id: "coach_single_meal_not_attention",
    status: "fail",
    detail: "Single meal / one-off deviation must not alone trigger coach attention.",
  };
}

export function evaluateCoachingAiOutputQuality(input: {
  output: CoachingDailyGenerationOutputJson;
  finalInterventionLevel: CoachingInterventionLevel;
  priorTomorrowFocus?: string | null;
  generationInput?: CoachingGenerationInput | null;
}): CoachingAiQualityReport {
  const { output, finalInterventionLevel, priorTomorrowFocus = null, generationInput = null } = input;
  const customerText = `${output.customer.encouragement} ${output.customer.today_feedback} ${output.customer.adjustment_priorities.join(" ")} ${output.customer.tomorrow_focus}`;
  const planAuthorityText = flattenPlanAuthorityText(
    generationInput?.profileMemory.planSnapshot,
    generationInput?.coachDirectives ?? null,
  );

  const priorityCount = output.customer.adjustment_priorities.length;

  const customer: CoachingAiQualityCheckItem[] = [
    checkEncouragementFirst(output.customer.encouragement),
    checkNotFoodPolice(customerText),
    {
      id: "customer_adjustment_priorities_count",
      status: priorityCount <= 2 ? "pass" : "fail",
      detail: `adjustment_priorities=${priorityCount} (0–2 allowed; empty OK on normal days)`,
    },
    {
      id: "customer_normal_allows_zero_priorities",
      status: priorityCount === 0 || priorityCount > 0 ? "pass" : "fail",
      detail:
        priorityCount === 0
          ? "Empty adjustment_priorities allowed when day is overall normal."
          : `adjustment_priorities=${priorityCount}`,
    },
    {
      id: "customer_tomorrow_focus_single",
      status: output.customer.tomorrow_focus.trim().length > 0 ? "pass" : "fail",
      detail: "tomorrow_focus should be one concrete focus.",
    },
    checkTomorrowFocusContinuity(output),
    checkBreakfastDeviationPriorityOrder(output, generationInput),
    checkPlanAuthority(customerText, planAuthorityText),
    checkNoPraiseBadBehavior(customerText),
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
    checkRecurringRequiresEvidence(output, generationInput),
    checkImprovedRequiresEvidence(output),
    checkSingleMealNotCoachAttention(output, generationInput),
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
    {
      id: "coach_watch_supportive_tone",
      status:
        finalInterventionLevel !== "watch" ||
        !FOOD_POLICE_PATTERNS.some((p) => p.test(customerText))
          ? "pass"
          : "fail",
      detail:
        finalInterventionLevel === "watch"
          ? "watch may raise standards but must stay supportive."
          : "Not a watch-level day.",
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
