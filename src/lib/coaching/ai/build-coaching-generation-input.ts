import { buildCoachingInputSnapshot, mapCoachDirectivesRecord } from "@/lib/coaching/ai/build-input-snapshot";
import { buildPriorAiContextFromOutput } from "@/lib/coaching/ai/coaching-prior-ai-context";
import {
  buildGenerationMealPhotoRefs,
  type CoachingMealPhotoCandidate,
} from "@/lib/coaching/ai/select-coaching-photos-for-generation";
import { resolveCoachingInterventionContext } from "@/lib/coaching/ai/resolve-intervention-context";
import { selectPriorCompletedAiOutput, type PriorAiOutputCandidate } from "@/lib/coaching/ai/select-prior-ai-output";
import { resolveSleepDurationMinutes } from "@/lib/coaching/coaching-sleep";
import {
  COACHING_GENERATION_INPUT_VERSION,
  type CoachingGenerationInput,
  type CoachingGenerationProfileMemory,
  type CoachingGenerationTodayContext,
  type CoachingProfileMemory,
} from "@/types/coaching-ai";
import { type CoachingDailyLogDetail, type CoachingEnrollment } from "@/types/coaching";
import type { BodyCompositionRecord, Customer } from "@/types/customer";

const SECONDARY_MEAL_SLOTS = ["fourth_meal", "snacks", "drinks"] as const;

function mapProfileMemoryForGeneration(profile: CoachingProfileMemory): CoachingGenerationProfileMemory {
  return {
    displayName: profile.customerDisplayName,
    goal: profile.goal,
    daysSinceEnrollmentStart: profile.daysSinceEnrollmentStart,
    planSnapshot: profile.planSnapshot,
    customerContext: profile.customerContext,
    baselineMeasurement: profile.baselineMeasurement,
  };
}

export function buildGenerationTodayContext(
  todayLog: CoachingDailyLogDetail,
  options?: { photoCandidates?: CoachingMealPhotoCandidate[] },
): CoachingGenerationTodayContext {
  const primaryMeals = buildGenerationMealPhotoRefs({
    todayLog,
    candidates: options?.photoCandidates,
  });

  const secondaryMealNotes = SECONDARY_MEAL_SLOTS.map((slot) => {
    const meal = todayLog.meals.find((entry) => entry.mealSlot === slot) ?? null;
    return {
      mealSlot: slot,
      textNote: meal?.textNote?.trim() || null,
    };
  });

  const sleepDurationMinutes = resolveSleepDurationMinutes({
    sleepDurationLabel: todayLog.sleepDuration,
    sleepBedtime: todayLog.sleepBedtime,
    sleepWakeTime: todayLog.sleepWakeTime,
  });

  return {
    logDate: todayLog.logDate,
    submitted: Boolean(todayLog.submittedAt),
    primaryMeals,
    secondaryMealNotes,
    waterMl: todayLog.waterMl,
    sleepBedtime: todayLog.sleepBedtime,
    sleepWakeTime: todayLog.sleepWakeTime,
    sleepDurationMinutes,
    sleepDurationLabel: todayLog.sleepDuration,
    exerciseNote: todayLog.exerciseNote?.trim() || null,
    bowelMovementCount: todayLog.bowelMovementCount,
    customerNote: todayLog.customerNote?.trim() || null,
  };
}

export function buildCoachingGenerationInput(input: {
  enrollment: CoachingEnrollment;
  customer: Pick<Customer, "displayName" | "heightCm" | "sex" | "region" | "occupation">;
  logDate: string;
  todayLog: CoachingDailyLogDetail;
  recentLogs: CoachingDailyLogDetail[];
  bodyRecords: BodyCompositionRecord[];
  coachDirectives?: Parameters<typeof mapCoachDirectivesRecord>[0];
  priorCompletedOutputs?: PriorAiOutputCandidate[];
  photoCandidates?: CoachingMealPhotoCandidate[];
  builtAt?: string;
}): CoachingGenerationInput {
  const coachDirectives = mapCoachDirectivesRecord(input.coachDirectives);
  const rollingLogs = input.recentLogs.length > 0 ? input.recentLogs : [input.todayLog];

  const snapshot = buildCoachingInputSnapshot({
    enrollment: input.enrollment,
    customer: input.customer,
    logDate: input.logDate,
    todayLog: input.todayLog,
    recentLogs: rollingLogs,
    bodyRecords: input.bodyRecords,
    coachDirectives,
    builtAt: input.builtAt,
  });

  const priorOutput = selectPriorCompletedAiOutput(input.priorCompletedOutputs ?? [], input.logDate);
  const priorAiContext = priorOutput ? buildPriorAiContextFromOutput(priorOutput) : null;

  return {
    version: COACHING_GENERATION_INPUT_VERSION,
    builtAt: input.builtAt ?? new Date().toISOString(),
    logDate: input.logDate,
    enrollmentId: input.enrollment.id,
    customerId: input.enrollment.customerId,
    profileMemory: mapProfileMemoryForGeneration(snapshot.profileMemory),
    rollingMemory: snapshot.rollingMemory,
    outcomeMemory: snapshot.outcomeMemory,
    coachDirectives: snapshot.coachDirectives,
    todayContext: buildGenerationTodayContext(input.todayLog, {
      photoCandidates: input.photoCandidates,
    }),
    priorAiContext,
    interventionContext: resolveCoachingInterventionContext({
      rollingMemory: snapshot.rollingMemory,
    }),
  };
}
