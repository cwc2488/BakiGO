import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type {
  CoachingDecisionContext,
  CoachingMealObservation,
} from "@/types/coaching-signals";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";

/**
 * Lightweight decision context for free-message turns.
 * Seeds meal observations from today's logged meal notes so recall / day-pattern
 * judgment still work when the current utterance is not itself a meal photo.
 */
export function buildMinimalDecisionContextForFreeMessage(input: {
  generationInput: CoachingGenerationInput;
  freeMessage: string;
  mealObservations?: CoachingMealObservation[];
}): CoachingDecisionContext {
  const customerVoice = extractCustomerVoiceSignals(input.freeMessage);
  const fromToday = mealObservationsFromTodayNotes(input.generationInput);
  const mealObservations = [
    ...(input.mealObservations ?? []),
    ...fromToday.filter(
      (obs) =>
        !(input.mealObservations ?? []).some(
          (existing) =>
            existing.mealSlot === obs.mealSlot &&
            existing.observedFoods.join("|") === obs.observedFoods.join("|"),
        ),
    ),
  ];
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

function mealObservationsFromTodayNotes(
  generationInput: CoachingGenerationInput,
): CoachingMealObservation[] {
  return generationInput.todayContext.primaryMeals
    .filter((m) => Boolean(m.textNote?.trim()) || Boolean(m.storagePath))
    .map((m) => {
      const note = m.textNote?.trim() ?? "";
      const foods = note
        ? note
            .replace(/^(?:早餐|午餐|晚餐|宵夜)(?:吃了|吃)?/, "")
            .split(/[、，,/]/)
            .map((s) => s.trim())
            .filter((s) => s.length >= 2 && s.length <= 24)
            .slice(0, 4)
        : [];
      const heavy = /炸|漢堡|薯條|奶茶|蛋糕|泡麵|披薩|可樂|雞排/.test(note);
      return {
        mealSlot: m.mealSlot,
        observedFoods: foods,
        signals: heavy ? (["fried_food"] as CoachingMealObservation["signals"]) : [],
        evidenceText: note ? [note.slice(0, 120)] : [],
        shakeObserved: /奶昔|代餐|shake/i.test(note),
        solidFoodObserved: foods.length > 0 || Boolean(m.storagePath),
        confidence: foods.length > 0 ? ("medium" as const) : ("low" as const),
      };
    });
}
