"use client";

import {
  buildChartGeometry,
  chartPointPosition,
  formatTrendDateLabel,
  formatTrendValue,
  type TrendSeries,
} from "@/lib/customers/body-composition-trends";
import { useMemo, useState } from "react";

function TrendChart({ series }: { series: TrendSeries }) {
  const geometry = useMemo(() => buildChartGeometry(series), [series]);
  const polyline = series.points
    .map((point, index) => {
      const { x, y } = chartPointPosition(geometry, index, series.points.length, point.value);
      return `${x},${y}`;
    })
    .join(" ");

  const firstDate = series.points[0]?.recordDate;
  const lastDate = series.points[series.points.length - 1]?.recordDate;
  const latest = series.points[series.points.length - 1];

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-medium text-[#86868b]">{series.label}</p>
          {latest ? (
            <p className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">
              {formatTrendValue(latest.value, series.unit)}
            </p>
          ) : null}
        </div>
        {firstDate && lastDate ? (
          <p className="text-[0.75rem] text-[#86868b]">
            {formatTrendDateLabel(firstDate)} → {formatTrendDateLabel(lastDate)}
          </p>
        ) : null}
      </div>

      <svg
        aria-label={`${series.label}趨勢圖`}
        className="mt-4 w-full"
        role="img"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      >
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = geometry.padding.top + ratio * (geometry.height - geometry.padding.top - geometry.padding.bottom);
          return (
            <line
              key={ratio}
              stroke="#ececee"
              strokeWidth="1"
              x1={geometry.padding.left}
              x2={geometry.width - geometry.padding.right}
              y1={y}
              y2={y}
            />
          );
        })}
        <polyline
          fill="none"
          points={polyline}
          stroke={series.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
        {series.points.map((point, index) => {
          const { x, y } = chartPointPosition(geometry, index, series.points.length, point.value);
          return (
            <circle
              cx={x}
              cy={y}
              fill="white"
              key={point.recordDate}
              r="4"
              stroke={series.color}
              strokeWidth="2"
            />
          );
        })}
      </svg>
    </div>
  );
}

export function BodyCompositionTrendCharts({ seriesList }: { seriesList: TrendSeries[] }) {
  const [activeKey, setActiveKey] = useState(seriesList[0]?.key ?? "weightKg");
  const activeSeries = seriesList.find((series) => series.key === activeKey) ?? seriesList[0];

  if (seriesList.length === 0) {
    return (
      <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
          趨勢圖
        </p>
        <p className="mt-3 text-[0.9375rem] text-[#86868b]">至少兩次量測後會顯示趨勢曲線。</p>
      </section>
    );
  }

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
        趨勢圖
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {seriesList.map((series) => {
          const active = series.key === activeSeries?.key;
          return (
            <button
              className={`rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                active
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-[var(--brand-bg)] text-[#636366]"
              }`}
              key={series.key}
              onClick={() => setActiveKey(series.key)}
              type="button"
            >
              {series.label}
            </button>
          );
        })}
      </div>

      {activeSeries ? (
        <div className="mt-5">
          <TrendChart series={activeSeries} />
        </div>
      ) : null}
    </section>
  );
}
