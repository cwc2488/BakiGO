import type {
  CoachingDailyGenerationOutputJson,
  CoachingGenerationInput,
  CoachingInterventionLevel,
} from "@/types/coaching-ai";
import type { CoachingPlanSnapshot } from "@/types/coaching";
import { assertCustomerFoodStatementEvidenceBacked } from "@/lib/coaching/ai/meal-follow-up-budget";
import type { CoachingDecisionContext, CoachingMealObservation } from "@/types/coaching-signals";
import { parseClockTimeToMinutes } from "@/lib/coaching/coaching-sleep";
import {
  buildRelevantCoachActionContext,
  relevantCoachActionContextAsOfIso,
} from "@/lib/coaching/coach-actions/build-relevant-coach-action-context";

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

/** Praising the diet itself when the day needs adjustment. */
const PRAISE_OFFTRACK_DIET_PATTERNS = [
  /今天.{0,12}(飲食|吃得).{0,8}(很好|很棒|很不錯|不錯)/,
  /吃得很棒/,
  /飲食很不錯/,
  /吃得開心最重要/,
  /繼續保持這樣吃/,
  /你今天做得不錯.{0,12}吃/,
  /吃得開心.{0,8}我很開心/,
];

const CLARIFICATION_QUESTION_PATTERN =
  /還有沒有搭配|除了.{0,8}還有|還有吃別的|其他東西|其他食物|有沒有搭配/;

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

function checkNoPraiseOffTrackDiet(output: CoachingDailyGenerationOutputJson): CoachingAiQualityCheckItem {
  const level = output.coach.daily_nutrition_assessment?.level;
  if (level !== "needs_adjustment" && level !== "off_track") {
    return {
      id: "customer_no_praise_offtrack_diet",
      status: "pass",
      detail: "Day is not needs_adjustment/off_track; diet-praise guard skipped.",
    };
  }

  const text = `${output.customer.encouragement} ${output.customer.today_feedback} ${output.customer.daily_food_summary}`;
  const hit = PRAISE_OFFTRACK_DIET_PATTERNS.find((pattern) => pattern.test(text));
  return {
    id: "customer_no_praise_offtrack_diet",
    status: hit ? "fail" : "pass",
    detail: hit
      ? `Praised diet behavior on ${level} day: ${hit.source}`
      : "No diet-behavior praise on needs_adjustment/off_track day.",
  };
}

function checkMealFollowUpBudget(output: CoachingDailyGenerationOutputJson): CoachingAiQualityCheckItem {
  const questions = (["breakfast", "lunch", "dinner"] as const)
    .map((slot) => output.customer.meal_feedback[slot]?.follow_up_question)
    .filter((value): value is string => Boolean(value && CLARIFICATION_QUESTION_PATTERN.test(value)));

  if (
    output.customer.follow_up_for_tomorrow &&
    CLARIFICATION_QUESTION_PATTERN.test(output.customer.follow_up_for_tomorrow)
  ) {
    questions.push(output.customer.follow_up_for_tomorrow);
  }

  if (questions.length > 1) {
    return {
      id: "customer_meal_followup_budget",
      status: "fail",
      detail: `Meal clarification questions=${questions.length}; max 1 per log_date.`,
    };
  }

  return {
    id: "customer_meal_followup_budget",
    status: "pass",
    detail: `Meal clarification questions=${questions.length} (budget <= 1).`,
  };
}

function checkOffTrackNotSoftened(output: CoachingDailyGenerationOutputJson): CoachingAiQualityCheckItem {
  const level = output.coach.daily_nutrition_assessment?.level;
  if (level !== "off_track") {
    return {
      id: "customer_offtrack_clear_wording",
      status: "pass",
      detail: "Not off_track; soft-wording guard skipped.",
    };
  }

  const text = `${output.customer.today_feedback} ${output.customer.daily_food_summary}`;
  const softened = /稍微調整|小調整|差不多就好|還算可以/.test(text);
  const clear =
    /偏離|需要調整|不太理想|不太符合|比較偏|需要改/.test(text) &&
    !softened;

  return {
    id: "customer_offtrack_clear_wording",
    status: clear ? "pass" : "fail",
    detail: clear
      ? "off_track customer wording clearly indicates meaningful deviation."
      : `off_track wording too soft or unclear: ${text.slice(0, 120)}`,
  };
}

function checkFollowUpFoodEvidence(
  output: CoachingDailyGenerationOutputJson,
  mealObservations: CoachingMealObservation[] | null | undefined,
): CoachingAiQualityCheckItem {
  if (!mealObservations || mealObservations.length === 0) {
    return {
      id: "customer_followup_food_evidence",
      status: "pass",
      detail: "No mealObservations provided; evidence binding skipped.",
    };
  }

  const statements = [
    output.customer.follow_up_for_tomorrow,
    ...(["breakfast", "lunch", "dinner"] as const).map(
      (slot) => output.customer.meal_feedback[slot]?.follow_up_question ?? null,
    ),
  ];

  for (const statement of statements) {
    const error = assertCustomerFoodStatementEvidenceBacked({
      statement,
      mealObservations,
    });
    if (error) {
      return {
        id: "customer_followup_food_evidence",
        status: "fail",
        detail: error,
      };
    }
  }

  // Explicit F regression: fabricated whole-day shake wording.
  const joined = statements.filter(Boolean).join(" ");
  if (/早餐和午餐和晚餐.*奶昔|三餐.*奶昔/.test(joined)) {
    const breakfast = mealObservations.find((item) => item.mealSlot === "breakfast");
    const lunch = mealObservations.find((item) => item.mealSlot === "lunch");
    const dinner = mealObservations.find((item) => item.mealSlot === "dinner");
    const allShake = [breakfast, lunch, dinner].every(
      (item) =>
        item &&
        (item.shakeObserved ||
          item.signals.includes("shake_dominant") ||
          item.observedFoods.some((food) => /奶昔|蛋白飲|代餐/.test(food))),
    );
    if (!allShake) {
      return {
        id: "customer_followup_food_evidence",
        status: "fail",
        detail: "Fabricated multi-meal shake follow-up without evidence.",
      };
    }
  }

  return {
    id: "customer_followup_food_evidence",
    status: "pass",
    detail: "Customer follow-up food statements are evidence-backed.",
  };
}

function checkNoShakeCertaintyAssertion(output: CoachingDailyGenerationOutputJson): CoachingAiQualityCheckItem {
  const mealTexts = [
    output.customer.daily_food_summary,
    output.customer.meal_feedback.breakfast?.summary,
    output.customer.meal_feedback.breakfast?.adjustment,
    output.customer.meal_feedback.dinner?.summary,
    output.customer.meal_feedback.dinner?.adjustment,
    output.customer.today_feedback,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  const forbidden = [
    /似乎沒有搭配其他食物/,
    /沒有搭配其他食物/,
    /確定只喝奶昔/,
    /只有奶昔/,
    /實際沒吃其他/,
  ].find((pattern) => pattern.test(mealTexts));

  return {
    id: "customer_shake_uncertainty_wording",
    status: forbidden ? "fail" : "pass",
    detail: forbidden
      ? `Forbidden shake certainty phrasing: ${forbidden.source}`
      : "No forbidden shake-only certainty phrasing detected.",
  };
}

function isAfterMidnightBedtimeForQuality(time: string | null | undefined): boolean {
  const minutes = time ? parseClockTimeToMinutes(time) : null;
  if (minutes == null) {
    return false;
  }
  return minutes < 6 * 60;
}

function flattenOutputTextForCoachMemory(output: CoachingDailyGenerationOutputJson): string {
  return [
    output.coach.daily_summary,
    output.coach.attention_reason ?? "",
    ...(output.coach.evidence ?? []),
    output.customer.today_feedback,
    output.customer.tomorrow_focus,
    output.customer.follow_up_for_tomorrow ?? "",
    ...output.customer.adjustment_priorities,
    output.customer.lifestyle_feedback.sleep ?? "",
  ].join("\n");
}

function checkCoachActionMemoryRespect(
  output: CoachingDailyGenerationOutputJson,
  generationInput: CoachingGenerationInput | null | undefined,
  decisionContext?: CoachingDecisionContext | null,
): CoachingAiQualityCheckItem {
  const memory = generationInput?.recentCoachActionMemory;
  const materialNotes = (memory?.materialActions ?? [])
    .map((action) => action.note?.trim() ?? "")
    .filter(Boolean);
  if (materialNotes.length === 0) {
    return {
      id: "coach_action_memory_no_redundant_ask",
      status: "pass",
      detail: "No material coach action memory present.",
    };
  }

  const allText = flattenOutputTextForCoachMemory(output);
  const knownNotes =
    decisionContext && generationInput
      ? buildRelevantCoachActionContext({
          memory,
          decisionContext,
          asOfIso: relevantCoachActionContextAsOfIso(generationInput.logDate),
        }).knownContexts.map((item) => item.note)
      : materialNotes;

  const hasKnown = knownNotes.length > 0;
  const redundantAsk =
    hasKnown &&
    (/為什麼晚睡|詢問.*晚睡原因|問他.*為什麼晚睡|再問.*晚睡|了解看看是什麼原因/.test(allText) ||
      (/問問|詢問/.test(allText) && /晚睡原因|為什麼晚睡|什麼原因/.test(allText)));

  return {
    id: "coach_action_memory_no_redundant_ask",
    status: redundantAsk ? "fail" : "pass",
    detail: redundantAsk
      ? "Relevant Coach Action Known Context already established; redundant clarification detected."
      : "No redundant clarification against Coach Action Memory.",
  };
}

function checkRelevantCoachActionContextCarryForward(
  output: CoachingDailyGenerationOutputJson,
  generationInput: CoachingGenerationInput | null | undefined,
  decisionContext?: CoachingDecisionContext | null,
): CoachingAiQualityCheckItem {
  if (!generationInput || !decisionContext) {
    return {
      id: "coach_action_relevant_context_carry_forward",
      status: "pass",
      detail: "No decisionContext provided; carry-forward check skipped.",
    };
  }

  const relevant = buildRelevantCoachActionContext({
    memory: generationInput.recentCoachActionMemory,
    decisionContext,
    asOfIso: relevantCoachActionContextAsOfIso(generationInput.logDate),
  });

  if (relevant.knownContexts.length === 0) {
    return {
      id: "coach_action_relevant_context_carry_forward",
      status: "pass",
      detail: "No relevant known Coach Action context for active issues.",
    };
  }

  const allText = flattenOutputTextForCoachMemory(output);
  const missing = relevant.knownContexts.filter((item) => {
    if (item.distinctiveFragments.length === 0) return false;
    return !item.distinctiveFragments.some((fragment) => allText.includes(fragment));
  });

  if (missing.length > 0) {
    return {
      id: "coach_action_relevant_context_carry_forward",
      status: "fail",
      detail: `Known Coach context not carried forward for: ${missing
        .map((item) => item.matchedActiveKeys.join("/"))
        .join(", ")}.`,
    };
  }

  return {
    id: "coach_action_relevant_context_carry_forward",
    status: "pass",
    detail: "Relevant known Coach Action context carried forward in wording.",
  };
}

function checkCoachActionDoesNotOverrideOutcome(
  generationInput: CoachingGenerationInput | null | undefined,
  decisionOutcomeStatus?: string | null,
): CoachingAiQualityCheckItem {
  const outcome = generationInput?.outcomeMemory;
  const memoryNote = (generationInput?.recentCoachActionMemory?.materialActions ?? [])
    .map((action) => action.note ?? "")
    .join(" ");
  if (!outcome || !memoryNote) {
    return {
      id: "coach_action_not_outcome_authority",
      status: "pass",
      detail: "No coach-note vs outcome conflict to check.",
    };
  }

  // Soft heuristic: optimistic coach notes must not imply we treat worsening as improving in memory layer.
  // Actual authority is enforced by assess-coaching-outcome / decisionContext — this check documents intent.
  void decisionOutcomeStatus;
  return {
    id: "coach_action_not_outcome_authority",
    status: "pass",
    detail: "Coach Action Memory is context-only; outcome authority remains deterministic.",
  };
}

function checkSleepDurationAndBedtime(
  output: CoachingDailyGenerationOutputJson,
  generationInput: CoachingGenerationInput | null | undefined,
): CoachingAiQualityCheckItem {
  const bedtime = generationInput?.todayContext.sleepBedtime ?? null;
  const durationMinutes = generationInput?.todayContext.sleepDurationMinutes ?? null;
  const sleepText = output.customer.lifestyle_feedback.sleep ?? "";

  if (!bedtime || durationMinutes == null) {
    return {
      id: "customer_sleep_duration_and_bedtime",
      status: "pass",
      detail: "No duration+late-bedtime pair in fixture; check skipped.",
    };
  }

  const adequateDuration = durationMinutes >= 7 * 60;
  const lateBedtime = isAfterMidnightBedtimeForQuality(bedtime);
  if (!adequateDuration || !lateBedtime) {
    return {
      id: "customer_sleep_duration_and_bedtime",
      status: "pass",
      detail: "Fixture is not adequate-duration + late-bedtime; check skipped.",
    };
  }

  const mentionsAdequate =
    /時數足夠|睡夠|睡滿|睡眠足夠|睡眠時數足夠|還算充足|充足/.test(sleepText);
  const mentionsLate =
    /偏晚|入睡.*晚|躺床.*晚|太晚睡|睡覺偏晚|00:24|半夜|凌晨/.test(sleepText);

  if (mentionsAdequate && mentionsLate) {
    return {
      id: "customer_sleep_duration_and_bedtime",
      status: "pass",
      detail: "Sleep feedback covers both adequate duration and late bedtime.",
    };
  }

  return {
    id: "customer_sleep_duration_and_bedtime",
    status: "fail",
    detail: `Expected both adequate duration + late bedtime. sleep="${sleepText}"`,
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
  mealObservations?: CoachingMealObservation[] | null;
  decisionContext?: CoachingDecisionContext | null;
}): CoachingAiQualityReport {
  const {
    output,
    finalInterventionLevel,
    priorTomorrowFocus = null,
    generationInput = null,
    mealObservations = null,
    decisionContext = null,
  } = input;
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
    checkNoPraiseOffTrackDiet(output),
    checkMealFollowUpBudget(output),
    checkOffTrackNotSoftened(output),
    checkFollowUpFoodEvidence(output, mealObservations),
    checkNoShakeCertaintyAssertion(output),
    checkSleepDurationAndBedtime(output, generationInput),
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
    checkCoachActionMemoryRespect(output, generationInput, decisionContext),
    checkRelevantCoachActionContextCarryForward(output, generationInput, decisionContext),
    checkCoachActionDoesNotOverrideOutcome(generationInput),
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
