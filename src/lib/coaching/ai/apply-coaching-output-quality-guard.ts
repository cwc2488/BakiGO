import type { CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";
import {
  dedupeCoachingProse,
  isCopiedConsumerText,
  stripCopiedConsumerSentences,
} from "@/lib/coaching/ai/coaching-text-dedup";

const CUSTOMER_FALLBACK = "今天的回報我有看到，我們依重點繼續。";
const COACH_FALLBACK = "今日回報已記錄；下次依系統重點追蹤即可。";

function cleanField(value: string | null | undefined, fallback?: string): string | null {
  if (value == null) return null;
  const cleaned = dedupeCoachingProse(value);
  if (cleaned.trim()) return cleaned;
  return fallback ?? null;
}

/**
 * Post-generation quality guard. Deterministic; no extra LLM call.
 * Applied after DecisionContext composition so prepended copies are also cleaned.
 */
export function applyCoachingOutputQualityGuard(
  output: CoachingDailyGenerationOutputJson,
): CoachingDailyGenerationOutputJson {
  const customer = output.customer;
  const encouragement = cleanField(customer.encouragement, "持續回報很重要，我們一起往前。") ?? "";
  const todayFeedback = cleanField(customer.today_feedback, CUSTOMER_FALLBACK) ?? CUSTOMER_FALLBACK;
  const dailyFoodSummary = cleanField(customer.daily_food_summary, "今天有餐點回報，細節我們再一起看。") ?? "";
  const tomorrowFocus = cleanField(customer.tomorrow_focus, "維持目前節奏") ?? "維持目前節奏";
  const customerVoice = cleanField(customer.customer_voice_response);
  const followUp = cleanField(customer.follow_up_for_tomorrow);
  const hydration = cleanField(customer.lifestyle_feedback.hydration);
  const sleep = cleanField(customer.lifestyle_feedback.sleep);
  const exercise = cleanField(customer.lifestyle_feedback.exercise);

  const mealFeedback = {
    breakfast: customer.meal_feedback.breakfast
      ? {
          ...customer.meal_feedback.breakfast,
          summary: cleanField(customer.meal_feedback.breakfast.summary, "早餐有回報") ?? "早餐有回報",
          good_point: cleanField(customer.meal_feedback.breakfast.good_point),
          adjustment: cleanField(customer.meal_feedback.breakfast.adjustment),
          follow_up_question: cleanField(customer.meal_feedback.breakfast.follow_up_question),
        }
      : null,
    lunch: customer.meal_feedback.lunch
      ? {
          ...customer.meal_feedback.lunch,
          summary: cleanField(customer.meal_feedback.lunch.summary, "午餐有回報") ?? "午餐有回報",
          good_point: cleanField(customer.meal_feedback.lunch.good_point),
          adjustment: cleanField(customer.meal_feedback.lunch.adjustment),
          follow_up_question: cleanField(customer.meal_feedback.lunch.follow_up_question),
        }
      : null,
    dinner: customer.meal_feedback.dinner
      ? {
          ...customer.meal_feedback.dinner,
          summary: cleanField(customer.meal_feedback.dinner.summary, "晚餐有回報") ?? "晚餐有回報",
          good_point: cleanField(customer.meal_feedback.dinner.good_point),
          adjustment: cleanField(customer.meal_feedback.dinner.adjustment),
          follow_up_question: cleanField(customer.meal_feedback.dinner.follow_up_question),
        }
      : null,
  };

  const consumerTexts = [
    encouragement,
    todayFeedback,
    dailyFoodSummary,
    tomorrowFocus,
    customerVoice ?? "",
  ];

  let dailySummary = cleanField(output.coach.daily_summary, COACH_FALLBACK) ?? COACH_FALLBACK;
  dailySummary = stripCopiedConsumerSentences(dailySummary, consumerTexts) || COACH_FALLBACK;
  if (isCopiedConsumerText(dailySummary, consumerTexts)) {
    dailySummary = COACH_FALLBACK;
  }

  return {
    ...output,
    customer: {
      ...customer,
      encouragement,
      today_feedback: todayFeedback,
      daily_food_summary: dailyFoodSummary,
      tomorrow_focus: tomorrowFocus,
      customer_voice_response: customerVoice,
      follow_up_for_tomorrow: followUp,
      lifestyle_feedback: { hydration, sleep, exercise },
      meal_feedback: mealFeedback,
      adjustment_priorities: customer.adjustment_priorities.map((item) => dedupeCoachingProse(item)),
    },
    coach: {
      ...output.coach,
      daily_summary: dailySummary,
      attention_reason: cleanField(output.coach.attention_reason),
    },
  };
}
