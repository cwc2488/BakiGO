"use client";

import {
  resolveRetailHouseDateRange,
  validateRetailHouseDateRange,
  type RetailHouseDateRange,
  type RetailHouseDateRangePreset,
} from "@/lib/retail-house/retail-house-date-range";
import { formatReportDateRange } from "@/lib/retail-house/format-report";
import { RetailGregorianDateFields } from "@/components/retail-house/RetailGregorianDateFields";
import { todayISODate } from "@/lib/config/app-config";
import type { ISODateString } from "@/types";
import { useMemo, useState } from "react";

const PRESET_LABELS: Record<RetailHouseDateRangePreset, string> = {
  week: "本週",
  month: "本月",
  custom: "自訂",
};

export function RetailHouseDateRangeSelector({
  value,
  onChange,
}: {
  value: RetailHouseDateRange;
  onChange: (next: RetailHouseDateRange) => void;
}) {
  const referenceDate = todayISODate();
  const [customStart, setCustomStart] = useState<ISODateString>(value.startDate);
  const [customEnd, setCustomEnd] = useState<ISODateString>(value.endDate);

  const rangeLabel = useMemo(
    () => formatReportDateRange(value.startDate, value.endDate),
    [value.endDate, value.startDate],
  );

  function applyPreset(preset: RetailHouseDateRangePreset) {
    const next = resolveRetailHouseDateRange(
      preset,
      referenceDate,
      customStart,
      customEnd,
    );
    onChange(next);
  }

  function applyCustomRange(startDate: ISODateString, endDate: ISODateString) {
    const error = validateRetailHouseDateRange(startDate, endDate, referenceDate);
    if (error) {
      return;
    }
    onChange({
      preset: "custom",
      startDate,
      endDate,
    });
  }

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">時間區間</h2>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">
            {rangeLabel} · 紀錄保留至少 2 年
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRESET_LABELS) as RetailHouseDateRangePreset[]).map((preset) => (
            <button
              key={preset}
              className={`rounded-full px-4 py-2 text-[0.875rem] font-semibold transition-colors ${
                value.preset === preset
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-[var(--brand-bg)] text-[#1d1d1f]"
              }`}
              onClick={() => applyPreset(preset)}
              type="button"
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
      </div>

      {value.preset === "custom" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">開始（西元）</span>
            <RetailGregorianDateFields
              onChange={(next) => {
                setCustomStart(next);
                applyCustomRange(next, customEnd);
              }}
              value={customStart}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">結束（西元）</span>
            <RetailGregorianDateFields
              onChange={(next) => {
                setCustomEnd(next);
                applyCustomRange(customStart, next);
              }}
              value={customEnd}
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
