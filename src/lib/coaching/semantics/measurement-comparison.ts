import type { BodyCompositionRecord } from "@/types/customer";
import type { MeasurementComparisonState, MetricComparison } from "@/lib/coaching/semantics/types";

function numericState(baseline: number, latest: number): MeasurementComparisonState {
  if (latest === baseline) return "UNCHANGED";
  return latest > baseline ? "INCREASED" : "DECREASED";
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function compareMeasurementMetric(input: {
  key: string;
  label: string;
  unit: string;
  baselineRecord: BodyCompositionRecord | null | undefined;
  latestRecord: BodyCompositionRecord | null | undefined;
  pick: (record: BodyCompositionRecord) => number | null | undefined;
}): MetricComparison {
  const baselineRec = input.baselineRecord ?? null;
  const latestRec = input.latestRecord ?? null;
  const baseline = baselineRec ? (input.pick(baselineRec) ?? null) : null;
  const latest = latestRec ? (input.pick(latestRec) ?? null) : null;
  const distinctRecords = Boolean(
    baselineRec && latestRec && baselineRec.id !== latestRec.id,
  );

  if (!distinctRecords || baseline == null || latest == null) {
    const known = latest ?? baseline;
    return {
      key: input.key,
      label: input.label,
      unit: input.unit,
      state: "INSUFFICIENT_DATA",
      baseline,
      latest: distinctRecords ? latest : null,
      displayLine:
        known != null
          ? `${input.label}　起始 ${formatNumber(known)} ${input.unit} · 目前只有起始量測`
          : `${input.label}　目前只有起始量測`,
    };
  }

  const state = numericState(baseline, latest);
  const valueLine = `${input.label}　${formatNumber(latest)} ${input.unit}`;
  if (state === "UNCHANGED") {
    return {
      key: input.key,
      label: input.label,
      unit: input.unit,
      state,
      baseline,
      latest,
      displayLine: `${valueLine}（與上次相同）`,
    };
  }
  return {
    key: input.key,
    label: input.label,
    unit: input.unit,
    state,
    baseline,
    latest,
    displayLine: `${input.label}　${formatNumber(baseline)} → ${formatNumber(latest)} ${input.unit}`,
  };
}

export function buildMeasurementComparisons(input: {
  baselineRecord: BodyCompositionRecord | null | undefined;
  latestRecord: BodyCompositionRecord | null | undefined;
}): MetricComparison[] {
  return [
    compareMeasurementMetric({
      key: "weightKg",
      label: "體重",
      unit: "kg",
      baselineRecord: input.baselineRecord,
      latestRecord: input.latestRecord,
      pick: (r) => r.weightKg,
    }),
    compareMeasurementMetric({
      key: "bodyFatPercent",
      label: "體脂",
      unit: "%",
      baselineRecord: input.baselineRecord,
      latestRecord: input.latestRecord,
      pick: (r) => r.bodyFatPercent,
    }),
    compareMeasurementMetric({
      key: "skeletalMuscleKg",
      label: "肌肉",
      unit: "kg",
      baselineRecord: input.baselineRecord,
      latestRecord: input.latestRecord,
      pick: (r) => r.skeletalMuscleKg,
    }),
  ];
}

export function measurementHeadline(comparisons: MetricComparison[]): string {
  if (comparisons.every((row) => row.state === "INSUFFICIENT_DATA")) {
    return "目前只有起始量測，還不能判斷體重趨勢。等待下一次量測後比較。";
  }
  return "最近的量測變化";
}
