import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type {
  CoachingDecisionContext,
  CoachingMealObservation,
} from "@/types/coaching-signals";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";

/**
 * Lightweight decision context for free-message turns.
 * Optionally accepts real-time meal vision observations for the current turn.
 */
export function buildMinimalDecisionContextForFreeMessage(input: {
  generationInput: CoachingGenerationInput;
  freeMessage: string;
  mealObservations?: CoachingMealObservation[];
}): CoachingDecisionContext {
  const customerVoice = extractCustomerVoiceSignals(input.freeMessage);
  const mealObservations = input.mealObservations ?? [];
  const dailyNutritionAssessment = assessDailyNutrition({ mealObservations });
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
    mealObservations,
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
