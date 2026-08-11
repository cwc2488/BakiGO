import { buildCoachingRollingMemory } from "@/lib/coaching/ai/coaching-rolling-aggregates";
import { resolveSleepDurationMinutes } from "@/lib/coaching/coaching-sleep";
import {
  COACHING_AI_SNAPSHOT_VERSION,
  COACHING_ROLLING_WINDOW_DAYS,
  type CoachingAiInputSnapshot,
  type CoachingBodyMeasurementSummary,
  type CoachingBodyTrendDelta,
  type CoachingCoachDirectivesMemory,
  type CoachingOutcomeMemory,
  type CoachingProfileMemory,
  type CoachingTodayContext,
  type CoachingTodayMealContext,
} from "@/types/coaching-ai";
import {
  COACHING_MEAL_SLOT_LABELS,
  COACHING_MEAL_SLOTS,
  type CoachingDailyLogDetail,
  type CoachingEnrollment,
  type CoachingMealSlot,
} from "@/types/coaching";
import type { BodyCompositionRecord, Customer } from "@/types/customer";

function daysBetweenDates(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

function mapBodyMeasurement(record: BodyCompositionRecord | null | undefined): CoachingBodyMeasurementSummary | null {
  if (!record) {
    return null;
  }

  return {
    recordDate: record.recordDate,
    weightKg: record.weightKg,
    bodyFatPercent: record.bodyFatPercent,
    skeletalMuscleKg: record.skeletalMuscleKg,
    visceralFatLevel: record.visceralFatLevel,
    bmi: record.bmi,
    bodyFatKg: record.bodyFatKg,
  };
}

function buildProfileMemory(input: {
  customer: Pick<Customer, "displayName" | "heightCm" | "sex" | "region" | "occupation">;
  enrollment: CoachingEnrollment;
  baselineRecord: BodyCompositionRecord | null;
  logDate: string;
}): CoachingProfileMemory {
  return {
    customerDisplayName: input.customer.displayName,
    goal: input.enrollment.goal,
    enrollmentStartedAt: input.enrollment.startedAt,
    daysSinceEnrollmentStart: daysBetweenDates(
      input.enrollment.startedAt.slice(0, 10),
      input.logDate,
    ),
    planSnapshot: input.enrollment.planSnapshot,
    customerContext: {
      heightCm: input.customer.heightCm ?? null,
      sex: input.customer.sex ?? null,
      region: input.customer.region ?? null,
      occupation: input.customer.occupation ?? null,
    },
    baselineMeasurement: mapBodyMeasurement(input.baselineRecord),
  };
}

function buildBodyTrendDelta(
  label: string,
  baseline: number | null,
  latest: number | null,
  unit: string,
): CoachingBodyTrendDelta | null {
  if (baseline == null || latest == null) {
    return null;
  }
  return {
    label,
    baseline,
    latest,
    delta: Math.round((latest - baseline) * 10) / 10,
    unit,
  };
}

function buildOutcomeTrendSummary(deltas: CoachingBodyTrendDelta[]): string | null {
  const weight = deltas.find((item) => item.label === "體重");
  const bodyFat = deltas.find((item) => item.label === "體脂率");
  if (weight && weight.delta < -0.3 && bodyFat && bodyFat.delta <= 0) {
    return "比基準期輕了，體脂沒有反彈。";
  }
  if (deltas.every((item) => Math.abs(item.delta) < 0.2)) {
    return "與基準期相比變化不大，適合先觀察。";
  }
  return "身體組成相較基準期出現變化。";
}

function buildOutcomeMemory(input: {
  bodyRecords: BodyCompositionRecord[];
  baselineBodyRecordId: string | null;
}): CoachingOutcomeMemory {
  const sorted = [...input.bodyRecords].sort((left, right) => right.recordDate.localeCompare(left.recordDate));
  const latestRecord = sorted[0] ?? null;

  let baselineRecord: BodyCompositionRecord | null = null;
  if (input.baselineBodyRecordId) {
    baselineRecord = sorted.find((record) => record.id === input.baselineBodyRecordId) ?? null;
  }
  baselineRecord ??= sorted.at(-1) ?? null;

  const baseline = mapBodyMeasurement(baselineRecord);
  const latest = mapBodyMeasurement(latestRecord);

  let trendDeltas: CoachingBodyTrendDelta[] = [];
  let trendSummary: string | null = null;
  let daysBetweenMeasurements: number | null = null;

  if (baselineRecord && latestRecord && baselineRecord.id !== latestRecord.id) {
    daysBetweenMeasurements = daysBetweenDates(baselineRecord.recordDate, latestRecord.recordDate);
    trendDeltas = [
      buildBodyTrendDelta("體重", baselineRecord.weightKg, latestRecord.weightKg, "kg"),
      buildBodyTrendDelta("體脂率", baselineRecord.bodyFatPercent, latestRecord.bodyFatPercent, "%"),
      buildBodyTrendDelta("骨骼肌", baselineRecord.skeletalMuscleKg, latestRecord.skeletalMuscleKg, "kg"),
      buildBodyTrendDelta("內臟脂肪", baselineRecord.visceralFatLevel, latestRecord.visceralFatLevel, ""),
      buildBodyTrendDelta("BMI", baselineRecord.bmi, latestRecord.bmi, ""),
    ].filter((item): item is CoachingBodyTrendDelta => item !== null);
    trendSummary = buildOutcomeTrendSummary(trendDeltas);
  }

  return {
    baselineMeasurement: baseline,
    latestMeasurement: latest,
    daysBetweenMeasurements,
    trendDeltas,
    trendSummary,
  };
}

function buildTodayMealContexts(todayLog: CoachingDailyLogDetail): CoachingTodayMealContext[] {
  return COACHING_MEAL_SLOTS.map((slot) => {
    const meal = todayLog.meals.find((entry) => entry.mealSlot === slot) ?? null;
    return {
      mealSlot: slot,
      mealSlotLabel: COACHING_MEAL_SLOT_LABELS[slot as CoachingMealSlot],
      textNote: meal?.textNote?.trim() || null,
      hasPhoto: Boolean(meal?.photo),
      photoStoragePath: meal?.photo?.storagePath ?? null,
      mealEntryId: meal?.id ?? null,
    };
  });
}

function buildTodayContext(todayLog: CoachingDailyLogDetail): CoachingTodayContext {
  const sleepDurationMinutes = resolveSleepDurationMinutes({
    sleepDurationLabel: todayLog.sleepDuration,
    sleepBedtime: todayLog.sleepBedtime,
    sleepWakeTime: todayLog.sleepWakeTime,
  });

  return {
    logDate: todayLog.logDate,
    submitted: Boolean(todayLog.submittedAt),
    meals: buildTodayMealContexts(todayLog),
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

export function buildCoachingInputSnapshot(input: {
  enrollment: CoachingEnrollment;
  customer: Pick<Customer, "displayName" | "heightCm" | "sex" | "region" | "occupation">;
  logDate: string;
  todayLog: CoachingDailyLogDetail;
  recentLogs: CoachingDailyLogDetail[];
  bodyRecords: BodyCompositionRecord[];
  coachDirectives?: CoachingCoachDirectivesMemory | null;
  builtAt?: string;
}): CoachingAiInputSnapshot {
  const baselineRecord =
    input.bodyRecords.find((record) => record.id === input.enrollment.baselineBodyRecordId) ??
    input.bodyRecords.at(-1) ??
    null;

  const rollingLogs = input.recentLogs.length > 0 ? input.recentLogs : [input.todayLog];

  return {
    version: COACHING_AI_SNAPSHOT_VERSION,
    builtAt: input.builtAt ?? new Date().toISOString(),
    logDate: input.logDate,
    enrollmentId: input.enrollment.id,
    customerId: input.enrollment.customerId,
    profileMemory: buildProfileMemory({
      customer: input.customer,
      enrollment: input.enrollment,
      baselineRecord,
      logDate: input.logDate,
    }),
    rollingMemory: buildCoachingRollingMemory(rollingLogs, COACHING_ROLLING_WINDOW_DAYS),
    outcomeMemory: buildOutcomeMemory({
      bodyRecords: input.bodyRecords,
      baselineBodyRecordId: input.enrollment.baselineBodyRecordId,
    }),
    coachDirectives: input.coachDirectives ?? null,
    todayContext: buildTodayContext(input.todayLog),
  };
}

export function mapCoachDirectivesRecord(input: {
  currentFocus?: string | null;
  currentPriority?: string | null;
  coachInstruction?: string | null;
  effectiveFrom?: string | null;
} | null | undefined): CoachingCoachDirectivesMemory | null {
  if (!input) {
    return null;
  }

  const hasContent = Boolean(
    input.currentFocus?.trim() || input.currentPriority?.trim() || input.coachInstruction?.trim(),
  );
  if (!hasContent) {
    return null;
  }

  return {
    currentFocus: input.currentFocus?.trim() || null,
    currentPriority: input.currentPriority?.trim() || null,
    coachInstruction: input.coachInstruction?.trim() || null,
    effectiveFrom: input.effectiveFrom ?? null,
  };
}
