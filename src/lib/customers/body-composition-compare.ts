import { todayISODate } from "@/lib/config/app-config";
import type { BodyCompositionRecord, Customer } from "@/types/customer";

export interface MetricDelta {
  label: string;
  previous: number;
  current: number;
  delta: number;
  unit: string;
}

export interface BodyCompositionComparison {
  previous: BodyCompositionRecord;
  current: BodyCompositionRecord;
  daysBetween: number;
  deltas: MetricDelta[];
  summary: string;
  suggestions: string[];
}

function daysBetween(left: string, right: string): number {
  const start = new Date(left);
  const end = new Date(right);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

function formatDelta(delta: number, unit: string): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) {
    return "持平";
  }
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}${unit}`;
}

function buildMetricDelta(
  label: string,
  previous: number | null,
  current: number | null,
  unit: string,
): MetricDelta | null {
  if (previous === null || current === null) {
    return null;
  }
  return {
    label,
    previous,
    current,
    delta: current - previous,
    unit,
  };
}

function buildLifeSummary(deltas: MetricDelta[]): string {
  const weight = deltas.find((item) => item.label === "體重");
  const bodyFat = deltas.find((item) => item.label === "體脂率");
  const visceral = deltas.find((item) => item.label === "內臟脂肪");

  if (weight && weight.delta < -0.3 && bodyFat && bodyFat.delta <= 0) {
    return "比上次輕了一點，體脂也沒有反彈，方向是對的。";
  }
  if (weight && weight.delta > 0.3 && visceral && visceral.delta > 0) {
    return "這次體重和內臟脂肪都有上升，可以先關心最近作息和晚餐時間。";
  }
  if (bodyFat && bodyFat.delta < -0.3) {
    return "體脂有下降，維持現在的節奏就很好。";
  }
  if (deltas.every((item) => Math.abs(item.delta) < 0.2)) {
    return "這次和上次差不多，可以問問最近生活有沒有什麼變化。";
  }
  return "有看到一些變化，值得花幾分鐘關心一下近況。";
}

function buildSuggestions(deltas: MetricDelta[], daysBetweenRecords: number): string[] {
  const suggestions: string[] = [];
  const weight = deltas.find((item) => item.label === "體重");
  const bodyFat = deltas.find((item) => item.label === "體脂率");
  const visceral = deltas.find((item) => item.label === "內臟脂肪");

  if (weight && weight.delta < -0.5) {
    suggestions.push("可以趁這次進步給對方一句鼓勵，並約 7～10 天後再量一次。");
  }
  if (weight && weight.delta > 0.5) {
    suggestions.push("先了解這兩週睡眠、外食和晚餐時間，不要急著推產品。");
  }
  if (bodyFat && bodyFat.delta > 0.5) {
    suggestions.push("可以問問最近是不是比較常外食，或運動量有沒有減少。");
  }
  if (visceral && visceral.delta >= 1) {
    suggestions.push("內臟脂肪上升時，優先關心作息規律和飲食時間。");
  }
  if (daysBetweenRecords > 21) {
    suggestions.push("距離上次量測已一段時間，這次是很好的重新開始時機。");
  }
  if (suggestions.length === 0) {
    suggestions.push("維持現在的節奏，7～14 天後再約一次量測。");
  }

  return suggestions.slice(0, 3);
}

export function compareBodyRecords(
  records: BodyCompositionRecord[],
): BodyCompositionComparison | null {
  if (records.length < 2) {
    return null;
  }

  const sorted = [...records].sort((left, right) => right.recordDate.localeCompare(left.recordDate));
  const current = sorted[0];
  const previous = sorted[1];
  const gapDays = daysBetween(previous.recordDate, current.recordDate);

  const deltas = [
    buildMetricDelta("體重", previous.weightKg, current.weightKg, "kg"),
    buildMetricDelta("體脂率", previous.bodyFatPercent, current.bodyFatPercent, "%"),
    buildMetricDelta("內臟脂肪", previous.visceralFatLevel, current.visceralFatLevel, ""),
    buildMetricDelta("基礎代謝", previous.basalMetabolicRate, current.basalMetabolicRate, ""),
    buildMetricDelta("身體年齡", previous.bodyAge, current.bodyAge, "歲"),
  ].filter((item): item is MetricDelta => item !== null);

  return {
    previous,
    current,
    daysBetween: gapDays,
    deltas,
    summary: buildLifeSummary(deltas),
    suggestions: buildSuggestions(deltas, gapDays),
  };
}

export interface CustomerFollowUpHint {
  customerId: string;
  reason: string;
  urgency: "high" | "medium" | "low";
}

export function buildCustomerFollowUpHints(
  customer: Customer,
  records: BodyCompositionRecord[],
  today: string = todayISODate(),
): CustomerFollowUpHint[] {
  const hints: CustomerFollowUpHint[] = [];

  if (customer.nextFollowUpDate && customer.nextFollowUpDate <= today) {
    hints.push({
      customerId: customer.id,
      reason: "到了你設定的追蹤日",
      urgency: "high",
    });
  }

  const latestRecord = records[0];
  if (!latestRecord) {
    hints.push({
      customerId: customer.id,
      reason: "還沒有量測紀錄",
      urgency: "medium",
    });
    return hints;
  }

  const daysSinceRecord = daysBetween(latestRecord.recordDate, today);
        if (daysSinceRecord >= 14 && customer.lastContactDate !== today) {
    hints.push({
      customerId: customer.id,
      reason: `已 ${daysSinceRecord} 天沒量測`,
      urgency: daysSinceRecord >= 21 ? "high" : "medium",
    });
  }

  const comparison = compareBodyRecords(records);
  if (comparison) {
    const weightUp = comparison.deltas.find((item) => item.label === "體重" && item.delta > 0.8);
    const visceralUp = comparison.deltas.find(
      (item) => item.label === "內臟脂肪" && item.delta >= 1,
    );
    if (weightUp || visceralUp) {
      hints.push({
        customerId: customer.id,
        reason: "最近數字有上升，值得關心一下",
        urgency: "medium",
      });
    }
  }

  return hints;
}

export function formatMetricDeltaLine(delta: MetricDelta): string {
  return `${delta.label} ${delta.current}${delta.unit}（${formatDelta(delta.delta, delta.unit)}）`;
}
