import type {
  CoachingBodyMeasurementSummary,
  CoachingBodyTrendDelta,
  CoachingGenerationInput,
  CoachingOutcomeMemory,
  CoachingRollingMemory,
} from "@/types/coaching-ai";
import type {
  CoachingGoalContext,
  CoachingMeasurementComparison,
  CoachingMeasurementStage,
  CoachingOutcomeAssessment,
  CoachingOutcomeStatus,
  CoachingSignalEvidence,
  CoachingTrendStatus,
} from "@/types/coaching-signals";
import type { CoachingInterventionLevel } from "@/types/coaching-ai";

const FAT_LOSS_METRICS = [
  "bodyFatPercent",
  "bodyFatKg",
  "weightKg",
  "visceralFatLevel",
  "skeletalMuscleKg",
  "bmi",
] as const;

const TREND_MIN_MEASUREMENTS = 3;
const TREND_MIN_SPAN_DAYS = 14;

function evidence(
  key: string,
  value: string | number | boolean | null,
  label?: string,
): CoachingSignalEvidence {
  return label ? { key, value, label } : { key, value };
}

function daysBetween(left: string, right: string): number {
  const start = new Date(`${left}T00:00:00.000Z`);
  const end = new Date(`${right}T00:00:00.000Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

export function inferCoachingGoalType(goal: string | null | undefined): string {
  const text = goal?.trim() ?? "";
  if (!text) return "general";
  if (/減脂|降體脂|fat\s*loss|body\s*fat/i.test(text)) return "fat_loss";
  if (/增肌|肌肉|muscle/i.test(text)) return "muscle_gain";
  if (/維持|maintain/i.test(text)) return "maintain";
  return "general";
}

export function goalLabelForType(goalType: string, rawGoal: string | null | undefined): string {
  if (rawGoal?.trim()) return rawGoal.trim();
  switch (goalType) {
    case "fat_loss":
      return "減脂";
    case "muscle_gain":
      return "增肌";
    case "maintain":
      return "維持";
    default:
      return "陪跑目標";
  }
}

export function resolveMeasurementStage(input: {
  baseline: CoachingBodyMeasurementSummary | null;
  latest: CoachingBodyMeasurementSummary | null;
  measurementCount: number;
  daysBetweenMeasurements: number | null;
}): CoachingMeasurementStage {
  if (!input.baseline) {
    return "baseline_only";
  }
  if (
    !input.latest ||
    input.latest.recordDate === input.baseline.recordDate ||
    input.measurementCount < 2
  ) {
    return "baseline_only";
  }
  if (
    input.measurementCount >= TREND_MIN_MEASUREMENTS &&
    (input.daysBetweenMeasurements ?? 0) >= TREND_MIN_SPAN_DAYS
  ) {
    return "trend_available";
  }
  return "comparison_available";
}

function findDelta(
  deltas: CoachingBodyTrendDelta[],
  label: string,
): CoachingBodyTrendDelta | null {
  return deltas.find((item) => item.label === label) ?? null;
}

/**
 * Fat-loss outcome authority: never equate weight-down alone with success.
 * Missing metrics are skipped — never invented.
 */
export function interpretFatLossOutcome(deltas: CoachingBodyTrendDelta[]): {
  status: CoachingOutcomeStatus;
  reasons: string[];
  evidence: CoachingSignalEvidence[];
} {
  const weight = findDelta(deltas, "體重");
  const bodyFat = findDelta(deltas, "體脂率");
  const muscle = findDelta(deltas, "骨骼肌");
  const visceral = findDelta(deltas, "內臟脂肪");
  const evidenceItems: CoachingSignalEvidence[] = [];
  const reasons: string[] = [];

  for (const item of deltas) {
    evidenceItems.push(evidence(`${item.label}_delta`, item.delta, item.label));
  }

  if (deltas.length === 0) {
    return {
      status: "insufficient_data",
      reasons: ["可用量測指標不足，暫不做結果判斷。"],
      evidence: evidenceItems,
    };
  }

  const bfImproved = bodyFat != null && bodyFat.delta <= -0.3;
  const bfWorsened = bodyFat != null && bodyFat.delta >= 0.5;
  const muscleLost = muscle != null && muscle.delta <= -0.8;
  const muscleUp = muscle != null && muscle.delta >= 0.3;
  const muscleStableOrUp = muscle == null || muscle.delta >= -0.3;
  const weightDown = weight != null && weight.delta <= -0.3;
  const weightUp = weight != null && weight.delta >= 0.3;
  const visceralUp = visceral != null && visceral.delta >= 1;
  const visceralDown = visceral != null && visceral.delta <= -1;
  const mostlyFlat = deltas.every((item) => Math.abs(item.delta) < 0.25);

  // K: weight down but meaningful muscle loss without clear fat-loss quality → mixed
  if (weightDown && muscleLost && (!bodyFat || bodyFat.delta > -1.0)) {
    reasons.push("體重有下降，但肌肉流失較明顯，不能只看成減脂成功。");
    return { status: "mixed", reasons, evidence: evidenceItems };
  }

  // L: recomposition — BF down + muscle up, weight may rise/flat
  if (bfImproved && muscleUp) {
    reasons.push("體脂下降且肌肉上升，屬於正向身體重組，不因體重微幅變化判定失敗。");
    return { status: "improving", reasons, evidence: evidenceItems };
  }

  // J / strong positive: weight down + BF down + muscle stable
  if (weightDown && bfImproved && muscleStableOrUp) {
    reasons.push("體重與體脂下降，肌肉大致維持，減脂方向良好。");
    return { status: "improving", reasons, evidence: evidenceItems };
  }

  if (bfImproved && muscleStableOrUp) {
    reasons.push("體脂有改善，肌肉目前穩定，方向偏正向。");
    if (visceralDown) reasons.push("內臟脂肪也有下降。");
    return { status: "improving", reasons, evidence: evidenceItems };
  }

  if (bfWorsened || (weightUp && bodyFat != null && bodyFat.delta > 0) || visceralUp) {
    reasons.push("減脂相關指標出現不利變化，需要提高執行要求，但不羞辱。");
    return { status: "worsening", reasons, evidence: evidenceItems };
  }

  if (mostlyFlat) {
    reasons.push("與起始量測相比變化不大，先觀察執行與下一次回測。");
    return { status: "flat", reasons, evidence: evidenceItems };
  }

  reasons.push("指標變化方向不一致，先看執行品質與下一次回測。");
  return { status: "mixed", reasons, evidence: evidenceItems };
}

export function buildGoalContext(input: {
  goal: string | null;
  outcomeMemory: CoachingOutcomeMemory;
  logDate: string;
  daysSinceEnrollmentStart: number;
}): CoachingGoalContext {
  const goalType = inferCoachingGoalType(input.goal);
  const baseline = input.outcomeMemory.baselineMeasurement;
  const latest = input.outcomeMemory.latestMeasurement;
  const measurementCount = input.outcomeMemory.measurementCount ?? (baseline ? 1 : 0);
  const measurementStage = resolveMeasurementStage({
    baseline,
    latest,
    measurementCount,
    daysBetweenMeasurements: input.outcomeMemory.daysBetweenMeasurements,
  });

  const daysSinceBaseline =
    baseline != null ? daysBetween(baseline.recordDate, input.logDate) : null;
  const daysSinceLatestMeasurement =
    latest != null ? daysBetween(latest.recordDate, input.logDate) : null;

  return {
    goalType,
    goalLabel: goalLabelForType(goalType, input.goal),
    measurementStage,
    baselineDate: baseline?.recordDate ?? null,
    latestMeasurementDate: latest?.recordDate ?? null,
    measurementCount,
    daysSinceBaseline,
    daysSinceLatestMeasurement,
    daysSinceEnrollmentStart: input.daysSinceEnrollmentStart,
    goalRelevantMetrics:
      goalType === "fat_loss" ? [...FAT_LOSS_METRICS] : ["weightKg", "bodyFatPercent"],
  };
}

export function buildMeasurementComparison(input: {
  outcomeMemory: CoachingOutcomeMemory;
  goalType: string;
}): CoachingMeasurementComparison | null {
  const { outcomeMemory, goalType } = input;
  const baseline = outcomeMemory.baselineMeasurement;
  const latest = outcomeMemory.latestMeasurement;
  if (!baseline || !latest || baseline.recordDate === latest.recordDate) {
    return null;
  }

  const interpreted =
    goalType === "fat_loss"
      ? interpretFatLossOutcome(outcomeMemory.trendDeltas)
      : interpretFatLossOutcome(outcomeMemory.trendDeltas);

  return {
    baseline,
    latest,
    deltas: outcomeMemory.trendDeltas,
    interpretation: interpreted.status,
    reasons: interpreted.reasons,
    evidence: interpreted.evidence,
  };
}

function periodOutcomeFromPair(
  earlier: CoachingBodyMeasurementSummary,
  later: CoachingBodyMeasurementSummary,
  goalType: string,
): CoachingOutcomeStatus {
  const deltas: CoachingBodyTrendDelta[] = [];
  const push = (
    label: string,
    left: number | null,
    right: number | null,
    unit: string,
  ) => {
    if (left == null || right == null) return;
    deltas.push({
      label,
      baseline: left,
      latest: right,
      delta: Math.round((right - left) * 10) / 10,
      unit,
    });
  };
  push("體重", earlier.weightKg, later.weightKg, "kg");
  push("體脂率", earlier.bodyFatPercent, later.bodyFatPercent, "%");
  push("骨骼肌", earlier.skeletalMuscleKg, later.skeletalMuscleKg, "kg");
  push("內臟脂肪", earlier.visceralFatLevel, later.visceralFatLevel, "");
  push("BMI", earlier.bmi, later.bmi, "");

  if (goalType === "fat_loss" || goalType === "general") {
    return interpretFatLossOutcome(deltas).status;
  }
  return interpretFatLossOutcome(deltas).status;
}

/**
 * Evaluate consecutive measurement periods (ascending dates).
 * Used for two-period intervention rule.
 */
export function evaluateMeasurementPeriods(input: {
  measurements: CoachingBodyMeasurementSummary[];
  goalType: string;
}): Array<{ fromDate: string; toDate: string; status: CoachingOutcomeStatus; spanDays: number }> {
  const sorted = [...input.measurements].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
  const periods: Array<{
    fromDate: string;
    toDate: string;
    status: CoachingOutcomeStatus;
    spanDays: number;
  }> = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i]!;
    const to = sorted[i + 1]!;
    const spanDays = daysBetween(from.recordDate, to.recordDate);
    if (spanDays < 1) continue;
    periods.push({
      fromDate: from.recordDate,
      toDate: to.recordDate,
      status: periodOutcomeFromPair(from, to, input.goalType),
      spanDays,
    });
  }
  return periods;
}

export function resolveTrendStatus(input: {
  measurementStage: CoachingMeasurementStage;
  outcomeStatus: CoachingOutcomeStatus;
  periods: Array<{ status: CoachingOutcomeStatus }>;
}): CoachingTrendStatus {
  if (input.measurementStage !== "trend_available") {
    return "not_applicable";
  }
  if (input.outcomeStatus === "improving") return "improving";
  if (input.outcomeStatus === "worsening") return "worsening";
  if (input.outcomeStatus === "flat") return "flat";
  if (input.outcomeStatus === "mixed") return "mixed";
  return "insufficient_data";
}

function hasExecutionSupportForRaise(rolling: CoachingRollingMemory | null | undefined): boolean {
  if (!rolling) return false;
  const agg = rolling.aggregates;
  if ((agg.lateSleepDays ?? 0) >= 2) return true;
  if (
    agg.daysWithReport >= 3 &&
    agg.breakfastCompletionRate != null &&
    agg.breakfastCompletionRate < 0.7
  ) {
    return true;
  }
  if (rolling.recurringPatterns.some((pattern) => /missed|late_sleep|incomplete/i.test(pattern))) {
    return true;
  }
  return false;
}

/**
 * Two-period intervention rule (docs/COACHING.md):
 * - First comparison period without improvement → observe first (do not raise for body alone)
 * - Two consecutive periods flat/worsening + execution support → may raise to watch
 * Never jumps to coach_attention from body alone.
 */
export function resolveBodyAwareInterventionLevel(input: {
  baseLevel: CoachingInterventionLevel;
  measurementStage: CoachingMeasurementStage;
  outcomeStatus: CoachingOutcomeStatus;
  periods: Array<{ status: CoachingOutcomeStatus }>;
  rollingMemory?: CoachingRollingMemory | null;
}): { finalInterventionLevel: CoachingInterventionLevel; reasons: string[] } {
  const reasons: string[] = [];
  let level = input.baseLevel;

  if (input.measurementStage === "baseline_only") {
    reasons.push("baseline_only: body outcome not yet measurable; keep intervention calm");
    return { finalInterventionLevel: level, reasons };
  }

  if (input.measurementStage === "comparison_available" && input.periods.length <= 1) {
    // First period: observe first — never raise for body flat/worsening alone
    reasons.push("first_comparison_period: observe first");
    return { finalInterventionLevel: level, reasons };
  }

  const lastTwo = input.periods.slice(-2);
  if (lastTwo.length >= 2) {
    const bothNonImproving = lastTwo.every(
      (period) => period.status === "flat" || period.status === "worsening",
    );
    if (bothNonImproving && hasExecutionSupportForRaise(input.rollingMemory)) {
      if (level === "normal") {
        level = "watch";
      }
      reasons.push("two_periods_non_improving_with_execution: raise_to_watch");
    } else if (bothNonImproving) {
      reasons.push("two_periods_non_improving: observe_until_execution_support");
    }
  }

  return { finalInterventionLevel: level, reasons };
}

export function assessCoachingOutcome(input: {
  generationInput: CoachingGenerationInput;
}): CoachingOutcomeAssessment {
  const { generationInput } = input;
  const goalContext = buildGoalContext({
    goal: generationInput.profileMemory.goal,
    outcomeMemory: generationInput.outcomeMemory,
    logDate: generationInput.logDate,
    daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
  });

  const comparison = buildMeasurementComparison({
    outcomeMemory: generationInput.outcomeMemory,
    goalType: goalContext.goalType,
  });

  let outcomeStatus: CoachingOutcomeStatus;
  let reasons: string[] = [];
  let evidenceItems: CoachingSignalEvidence[] = [];

  if (!generationInput.outcomeMemory.baselineMeasurement) {
    outcomeStatus = "insufficient_data";
    reasons = ["尚未建立起始量測。"];
    evidenceItems = [evidence("baseline_missing", true)];
  } else if (goalContext.measurementStage === "baseline_only") {
    outcomeStatus = "not_yet_measurable";
    reasons = ["目前只有起始量測，尚不能評論身體變化。"];
    evidenceItems = [
      evidence("measurement_stage", "baseline_only"),
      evidence("baseline_date", goalContext.baselineDate),
    ];
  } else if (comparison) {
    outcomeStatus = comparison.interpretation;
    reasons = comparison.reasons;
    evidenceItems = comparison.evidence;
  } else {
    outcomeStatus = "insufficient_data";
    reasons = ["量測資料不足以判斷結果。"];
  }

  const measurements = generationInput.outcomeMemory.measurementSequence ?? [];
  const periods = evaluateMeasurementPeriods({
    measurements:
      measurements.length > 0
        ? measurements
        : [generationInput.outcomeMemory.baselineMeasurement, generationInput.outcomeMemory.latestMeasurement].filter(
            (item): item is CoachingBodyMeasurementSummary => item != null,
          ),
    goalType: goalContext.goalType,
  });

  const trendStatus = resolveTrendStatus({
    measurementStage: goalContext.measurementStage,
    outcomeStatus,
    periods,
  });

  const customerSummary =
    outcomeStatus === "not_yet_measurable"
      ? "目前已有起始量測，持續累積每日執行；下一次回測後就能開始比較身體變化。"
      : outcomeStatus === "improving"
        ? reasons[0] ?? "方向是好的，繼續維持。"
        : outcomeStatus === "mixed"
          ? reasons[0] ?? "結果有好有壞，先把執行品質顧好。"
          : outcomeStatus === "flat"
            ? "目前身體數據變化不大，先觀察執行與下一次回測。"
            : outcomeStatus === "worsening"
              ? "最近結果需要調整執行，我們一起提高要求，但不責備。"
              : "尚未建立足夠量測資料。";

  return {
    goalContext,
    comparison,
    outcomeStatus,
    trendStatus,
    periods,
    reasons,
    evidence: evidenceItems,
    customerSummary,
  };
}

export const COACHING_OUTCOME_STATUS_LABELS: Record<CoachingOutcomeStatus, string> = {
  not_yet_measurable: "持續累積中",
  improving: "持續改善",
  mixed: "結果好壞交錯",
  flat: "持平觀察",
  worsening: "需要調整",
  insufficient_data: "資料不足",
};

export const COACHING_TREND_STATUS_LABELS: Record<CoachingTrendStatus, string> = {
  not_applicable: "尚未進入趨勢判斷",
  improving: "持續改善",
  mixed: "結果好壞交錯",
  flat: "持平觀察",
  worsening: "需要調整",
  insufficient_data: "資料不足",
};

export const COACHING_MEASUREMENT_STAGE_LABELS: Record<CoachingMeasurementStage, string> = {
  baseline_only: "只有起始量測",
  comparison_available: "可比較起始與最新",
  trend_available: "可看趨勢",
};
