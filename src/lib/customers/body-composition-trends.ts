import type { BodyCompositionRecord } from "@/types/customer";

export type TrendMetricKey =
  | "weightKg"
  | "bodyFatPercent"
  | "visceralFatLevel"
  | "bodyAge";

export interface TrendPoint {
  recordDate: string;
  value: number;
}

export interface TrendSeries {
  key: TrendMetricKey;
  label: string;
  unit: string;
  color: string;
  points: TrendPoint[];
}

const METRIC_CONFIG: Record<
  TrendMetricKey,
  { label: string; unit: string; color: string; pick: (record: BodyCompositionRecord) => number | null }
> = {
  weightKg: {
    label: "體重",
    unit: "kg",
    color: "#248a3d",
    pick: (record) => record.weightKg,
  },
  bodyFatPercent: {
    label: "體脂率",
    unit: "%",
    color: "#bf5af2",
    pick: (record) => record.bodyFatPercent,
  },
  visceralFatLevel: {
    label: "內臟脂肪",
    unit: "",
    color: "#ff9f0a",
    pick: (record) => record.visceralFatLevel,
  },
  bodyAge: {
    label: "身體年齡",
    unit: "歲",
    color: "#ff6482",
    pick: (record) => record.bodyAge,
  },
};

export interface PortalTrendRecord {
  recordDate: string;
  weightKg?: number | null;
  bodyFatPercent?: number | null;
  visceralFatLevel?: number | null;
  bodyAge?: number | null;
}

function buildSeriesFromValues(
  key: TrendMetricKey,
  entries: Array<{ recordDate: string; value: number | null | undefined }>,
): TrendSeries | null {
  const config = METRIC_CONFIG[key];
  const points = entries
    .filter((entry) => entry.value !== null && entry.value !== undefined)
    .map((entry) => ({ recordDate: entry.recordDate, value: entry.value as number }))
    .sort((left, right) => left.recordDate.localeCompare(right.recordDate));

  if (points.length < 2) {
    return null;
  }

  return {
    key,
    label: config.label,
    unit: config.unit,
    color: config.color,
    points,
  };
}

export function buildBodyCompositionTrendSeries(
  records: BodyCompositionRecord[],
): TrendSeries[] {
  const sorted = [...records].sort((left, right) => left.recordDate.localeCompare(right.recordDate));

  return (Object.keys(METRIC_CONFIG) as TrendMetricKey[])
    .map((key) =>
      buildSeriesFromValues(
        key,
        sorted.map((record) => ({
          recordDate: record.recordDate,
          value: METRIC_CONFIG[key].pick(record),
        })),
      ),
    )
    .filter((series): series is TrendSeries => series !== null);
}

export function buildPortalTrendSeries(records: PortalTrendRecord[]): TrendSeries[] {
  const sorted = [...records].sort((left, right) => left.recordDate.localeCompare(right.recordDate));

  return (Object.keys(METRIC_CONFIG) as TrendMetricKey[])
    .map((key) =>
      buildSeriesFromValues(
        key,
        sorted.map((record) => ({
          recordDate: record.recordDate,
          value: record[key as keyof PortalTrendRecord] as number | null | undefined,
        })),
      ),
    )
    .filter((series): series is TrendSeries => series !== null);
}

export interface ChartGeometry {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  minValue: number;
  maxValue: number;
}

export function buildChartGeometry(series: TrendSeries): ChartGeometry {
  const values = series.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  return {
    width: 320,
    height: 160,
    padding: { top: 16, right: 12, bottom: 28, left: 12 },
    minValue: min - spread * 0.15,
    maxValue: max + spread * 0.15,
  };
}

export function chartPointPosition(
  geometry: ChartGeometry,
  index: number,
  total: number,
  value: number,
): { x: number; y: number } {
  const plotWidth = geometry.width - geometry.padding.left - geometry.padding.right;
  const plotHeight = geometry.height - geometry.padding.top - geometry.padding.bottom;
  const x =
    geometry.padding.left + (total <= 1 ? plotWidth / 2 : (index / (total - 1)) * plotWidth);
  const ratio = (value - geometry.minValue) / (geometry.maxValue - geometry.minValue);
  const y = geometry.padding.top + plotHeight - ratio * plotHeight;
  return { x, y };
}

export function formatTrendValue(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  return unit ? `${rounded}${unit}` : `${rounded}`;
}

export function formatTrendDateLabel(recordDate: string): string {
  return `${Number(recordDate.slice(5, 7))}/${Number(recordDate.slice(8, 10))}`;
}
