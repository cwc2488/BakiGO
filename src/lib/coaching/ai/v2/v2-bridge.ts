import {
  COACHING_DAILY_GENERATION_OUTPUT_VERSION,
  type CoachingDailyGenerationOutputJson,
  type CoachingInterventionLevel,
} from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2GenerationDraft } from "@/types/coaching-ai-v2";

/**
 * Bridge V2 freeform draft into the persisted V1 output_json shape so
 * Attention / Command Center / existing stores keep working.
 * Customer UI prefers coach_message (stored in customer.coach_message).
 */
export function bridgeV2DraftToDailyOutput(input: {
  draft: CoachingAiV2GenerationDraft;
  decisionContext: CoachingDecisionContext;
  finalInterventionLevel: CoachingInterventionLevel;
}): CoachingDailyGenerationOutputJson & {
  customer: CoachingDailyGenerationOutputJson["customer"] & { coach_message: string };
  v2_meta: CoachingAiV2GenerationDraft["meta"];
} {
  const { draft, decisionContext, finalInterventionLevel } = input;
  const message = draft.coachMessage.trim();
  const nutrition = decisionContext.dailyNutritionAssessment;

  return {
    version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
    customer: {
      coach_message: message,
      // Legacy fields retained for coach tooling / older clients — not primary UI.
      encouragement: message.slice(0, 240),
      today_feedback: message.slice(0, 500),
      daily_food_summary: summarizeFoodForBridge(decisionContext) || "今日飲食已記錄。",
      meal_feedback: {
        breakfast: null,
        lunch: null,
        dinner: null,
      },
      lifestyle_feedback: {
        hydration: null,
        sleep: null,
        exercise: null,
      },
      customer_voice_response: decisionContext.customerVoice.length > 0 ? message.slice(0, 320) : null,
      adjustment_priorities: decisionContext.priorities.slice(0, 2).map((p) => p.reason),
      tomorrow_focus:
        decisionContext.priorities[0]?.tomorrowFocusSubject?.slice(0, 160) || "維持目前節奏",
      follow_up_for_tomorrow: null,
    },
    coach: {
      daily_summary: message.slice(0, 280),
      recurring_issue: decisionContext.recurringIssue?.label ?? null,
      improved_issue: decisionContext.improvedIssue?.label ?? null,
      proposed_intervention_level: finalInterventionLevel,
      coach_attention_required:
        decisionContext.coachAttention.required || draft.meta.escalationSuggested,
      attention_reason:
        draft.meta.escalationReason ?? decisionContext.coachAttention.reason ?? null,
      evidence: decisionContext.priorities
        .flatMap((p) => p.evidence.map((e) => `${e.key}=${String(e.value)}`))
        .slice(0, 8),
      follow_ups: [],
      photo_reuse_flags: [],
      daily_nutrition_assessment: {
        level: nutrition.level,
        label:
          nutrition.level === "on_track"
            ? "方向大致OK"
            : nutrition.level === "needs_adjustment"
              ? "需要調整"
              : nutrition.level === "off_track"
                ? "明顯偏離"
                : "資料不足",
        reasons: nutrition.reasons.slice(0, 6),
        positive_factors: nutrition.positiveFactors.slice(0, 4),
        adjustment_subjects: nutrition.adjustmentSubjects.slice(0, 6),
        confidence: nutrition.confidence,
      },
    },
    v2_meta: draft.meta,
  };
}

function summarizeFoodForBridge(decision: CoachingDecisionContext): string {
  const foods = decision.mealObservations
    .flatMap((o) => o.observedFoods)
    .filter(Boolean)
    .slice(0, 8);
  if (foods.length === 0) return "";
  return `觀察到：${foods.join("、")}`;
}

export function extractCoachMessageFromOutput(
  output: CoachingDailyGenerationOutputJson | null | undefined,
): string | null {
  if (!output?.customer) return null;
  const extended = output.customer as { coach_message?: string | null };
  if (extended.coach_message?.trim()) return extended.coach_message.trim();
  return null;
}
