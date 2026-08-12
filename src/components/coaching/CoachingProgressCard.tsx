"use client";

import { CrmCard } from "@/components/members/ui";
import type { CoachingProgressView } from "@/lib/coaching/build-coaching-progress-view";

function formatMetric(value: number | null, unit: string): string {
  if (value == null) return "—";
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${rounded} ${unit}` : rounded;
}

function formatDelta(delta: number | null, unit: string): string {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : "";
  const rounded = Math.round(delta * 10) / 10;
  return unit ? `${sign}${rounded}${unit}` : `${sign}${rounded}`;
}

export function CoachingProgressCard({ progress }: { progress: CoachingProgressView }) {
  return (
    <CrmCard className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-[1.375rem] font-semibold text-[#1d1d1f]">我的 90 天進度</h2>
        <p className="text-[0.9375rem] text-[#636366]">
          {progress.dayNumber != null ? `Day ${progress.dayNumber} / ${progress.dayTotal}` : `90 天陪跑`}
          {" · "}
          目標 {progress.goalLabel}
        </p>
      </div>

      {progress.baselineMissing ? (
        <div className="rounded-[1rem] bg-[#f5f5f7] px-4 py-3 text-[0.9375rem] text-[#636366]">
          尚未建立起始量測。先把每日回報做好，教練補上量測後就能開始看身體變化。
        </div>
      ) : null}

      {progress.waitingForRetest ? (
        <div className="space-y-3">
          <p className="text-[0.8125rem] font-medium text-[#86868b]">起始量測</p>
          <div className="grid grid-cols-2 gap-3">
            {progress.metrics.map((metric) => (
              <div key={metric.key} className="rounded-[1rem] border border-[#e5e5ea] px-3 py-3">
                <p className="text-[0.75rem] text-[#86868b]">{metric.label}</p>
                <p className="mt-1 text-[1.0625rem] font-semibold text-[#1d1d1f]">
                  {formatMetric(metric.baseline, metric.unit)}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-[1rem] bg-[#f5f5f7] px-4 py-3 space-y-1">
            <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">目前狀態：尚未進行第二次量測</p>
            <p className="text-[0.875rem] text-[#636366]">{progress.customerSummary}</p>
          </div>
        </div>
      ) : null}

      {!progress.baselineMissing && !progress.waitingForRetest ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-[0.875rem]">
              <thead>
                <tr className="text-[#86868b]">
                  <th className="pb-2 font-medium">項目</th>
                  <th className="pb-2 font-medium">起始</th>
                  <th className="pb-2 font-medium">現在</th>
                  <th className="pb-2 font-medium">變化</th>
                </tr>
              </thead>
              <tbody>
                {progress.metrics.map((metric) => (
                  <tr key={metric.key} className="border-t border-[#eef2ea] text-[#1d1d1f]">
                    <td className="py-2">{metric.label}</td>
                    <td className="py-2">{formatMetric(metric.baseline, metric.unit)}</td>
                    <td className="py-2">{formatMetric(metric.latest, metric.unit)}</td>
                    <td className="py-2">{formatDelta(metric.delta, metric.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-[1rem] bg-[#f5f5f7] px-4 py-3 space-y-1">
            <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">
              目前狀態：{progress.outcomeStatusLabel}
            </p>
            {progress.measurementStage === "trend_available" ? (
              <p className="text-[0.875rem] text-[#636366]">最近趨勢：{progress.trendStatusLabel}</p>
            ) : null}
            <p className="text-[0.875rem] text-[#636366]">{progress.customerSummary}</p>
          </div>
        </div>
      ) : null}
    </CrmCard>
  );
}
