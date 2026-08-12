import type {
  CoachingBodyMeasurementSummary,
  CoachingBodyTrendDelta,
  CoachingOutcomeMemory,
} from "@/types/coaching-ai";
import type { BodyCompositionRecord } from "@/types/customer";

function daysBetweenDates(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

function mapBodyMeasurement(record: BodyCompositionRecord | null | undefined): CoachingBodyMeasurementSummary | null {
  if (!record) return null;
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

function buildBodyTrendDelta(
  label: string,
  baseline: number | null,
  latest: number | null,
  unit: string,
): CoachingBodyTrendDelta | null {
  if (baseline == null || latest == null) return null;
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

/** Shared outcome memory builder for generation input + progress UI. */
export function buildOutcomeMemoryForProgress(input: {
  bodyRecords: BodyCompositionRecord[];
  baselineBodyRecordId: string | null;
}): CoachingOutcomeMemory {
  const sorted = [...input.bodyRecords].sort((left, right) =>
    right.recordDate.localeCompare(left.recordDate),
  );
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

  const byDate = new Map<string, CoachingBodyMeasurementSummary>();
  for (const record of [...sorted].reverse()) {
    const mapped = mapBodyMeasurement(record);
    if (!mapped) continue;
    if (!byDate.has(mapped.recordDate)) {
      byDate.set(mapped.recordDate, mapped);
    }
  }
  const measurementSequence = [...byDate.values()].sort((left, right) =>
    left.recordDate.localeCompare(right.recordDate),
  );

  return {
    baselineMeasurement: baseline,
    latestMeasurement: latest,
    daysBetweenMeasurements,
    trendDeltas,
    trendSummary,
    measurementCount: measurementSequence.length,
    measurementSequence,
  };
}
