/** Pinned production evaluation + inference model — do not use floating alias. */
export const COACHING_DAILY_AI_MODEL_ID = "gpt-4o-mini-2024-07-18" as const;

export const COACHING_DAILY_AI_PROMPT_VERSION = "coaching_daily_v3d2" as const;

export const COACHING_DAILY_AI_TIMEOUT_MS = 30_000 as const;

export const COACHING_DAILY_AI_UNAVAILABLE_MESSAGE = "AI 陪跑教練目前無法使用";

export const COACHING_DAILY_AI_OPENAI_IMAGE_DETAIL = "low" as const;

/**
 * P0.2: Daily coach NL call does not re-attach meal photos.
 * Vision owns photo interpretation; coach uses decisionContext.mealObservations.
 * Set env COACHING_DAILY_COACH_ATTACH_MEAL_IMAGES=1 only for A/B experiments.
 */
export function shouldAttachMealImagesToDailyCoach(): boolean {
  return process.env.COACHING_DAILY_COACH_ATTACH_MEAL_IMAGES === "1";
}

export function getCoachingDailyAiModelId(): string {
  return COACHING_DAILY_AI_MODEL_ID;
}
