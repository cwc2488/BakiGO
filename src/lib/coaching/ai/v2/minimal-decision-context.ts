import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";

/**
 * Lightweight decision context for free-message turns (no vision / meal photos).
 * Reuses goal/outcome defaults; avoids full signal engine cost for short chats.
 */
export function buildMinimalDecisionContextForFreeMessage(input: {
  generationInput: CoachingGenerationInput;
  freeMessage: string;
}): CoachingDecisionContext {
  const customerVoice = extractCustomerVoiceSignals(input.freeMessage);
  const dailyNutritionAssessment = assessDailyNutrition({ mealObservations: [] });
  const goalLabel = input.generationInput.profileMemory.goal ?? "陪跑目標";

  return {
    signals: [],
    positiveSignals: [],
    priorities: [],
    recurringIssue: null,
    improvedIssue: null,
    coachAttention: { required: false, reason: null, evidence: [] },
    finalInterventionLevel: "normal",
    customerVoice,
    mealObservations: [],
    photoReuse: [],
    pendingFollowUps: input.generationInput.priorAiContext?.pendingFollowUps ?? [],
    dailyNutritionAssessment,
    mealFollowUpBudget: {
      maxCustomerMealClarifications: 1,
      selectedMealSlot: null,
      selectedQuestion: null,
      suppressedMealSlots: [],
      consolidatedQuestion: null,
      allowCustomerMealClarification: false,
    },
    mealPlanContext: {
      breakfastAllowsShake: true,
      lunchAllowsShake: true,
      dinnerAllowsShake: true,
    },
    goalContext: {
      goalType: "general",
      goalLabel,
      measurementStage: "baseline_only",
      baselineDate: null,
      latestMeasurementDate: null,
      measurementCount: 0,
      daysSinceBaseline: null,
      daysSinceLatestMeasurement: null,
      daysSinceEnrollmentStart: input.generationInput.profileMemory.daysSinceEnrollmentStart,
      goalRelevantMetrics: [],
    },
    outcomeAssessment: {
      goalContext: {
        goalType: "general",
        goalLabel,
        measurementStage: "baseline_only",
        baselineDate: null,
        latestMeasurementDate: null,
        measurementCount: 0,
        daysSinceBaseline: null,
        daysSinceLatestMeasurement: null,
        daysSinceEnrollmentStart: input.generationInput.profileMemory.daysSinceEnrollmentStart,
        goalRelevantMetrics: [],
      },
      comparison: null,
      outcomeStatus: "not_yet_measurable",
      trendStatus: "insufficient_data",
      periods: [],
      reasons: [],
      evidence: [],
      customerSummary: "",
    },
  };
}
