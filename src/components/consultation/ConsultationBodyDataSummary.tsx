"use client";

import type { BodyCompositionRecord } from "@/types/customer";

function formatMetric(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${value}${suffix}`;
}

export function ConsultationBodyDataSummary({
  heightCm,
  bodyRecord,
}: {
  heightCm?: number;
  bodyRecord?: BodyCompositionRecord;
}) {
  if (!bodyRecord) {
    return (
      <div className="rounded-[1.25rem] border border-[#f0d4dc] bg-[#fff8fa] px-4 py-4 text-sm text-[#c08a98]">
        找不到 Step 3 的量測紀錄。請先完成身體量測，或確認資料已同步。
      </div>
    );
  }

  const items = [
    { label: "身高", value: heightCm ? `${heightCm} cm` : "—" },
    { label: "體重", value: formatMetric(bodyRecord.weightKg, " kg") },
    { label: "BMI", value: formatMetric(bodyRecord.bmi) },
    { label: "體脂率", value: formatMetric(bodyRecord.bodyFatPercent, " %") },
    { label: "骨骼肌", value: formatMetric(bodyRecord.skeletalMuscleKg, " kg") },
    { label: "內臟脂肪", value: formatMetric(bodyRecord.visceralFatLevel) },
    { label: "基礎代謝", value: formatMetric(bodyRecord.basalMetabolicRate, " kcal") },
    { label: "身體年齡", value: formatMetric(bodyRecord.bodyAge, " 歲") },
  ];

  return (
    <div className="space-y-3 rounded-[1.5rem] bg-white/90 p-4 ring-1 ring-[#eadfd6]">
      <p className="text-sm font-medium text-[#5f4f47]">Step 3 量測數據（供解說參考）</p>
      <p className="text-xs leading-5 text-[#9a8b82]">
        量測日期：{bodyRecord.recordDate}
        {bodyRecord.age !== null && bodyRecord.age !== undefined ? ` · 年齡 ${bodyRecord.age} 歲` : ""}
      </p>
      <dl className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-[1rem] bg-[#faf6f1] px-3 py-3">
            <dt className="text-xs text-[#9a8b82]">{item.label}</dt>
            <dd className="mt-1 text-base font-semibold text-[#2f2622]">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
