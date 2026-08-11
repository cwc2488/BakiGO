"use client";

import {
  clampGregorianDay,
  getDaysInGregorianMonth,
  parseGregorianDate,
  type GregorianDateParts,
} from "@/lib/retail-house/retail-house-gregorian-date";
import { getRetailHouseGregorianYearOptions } from "@/lib/retail-house/retail-house-date-range";
import { todayISODate } from "@/lib/config/app-config";
import type { ISODateString } from "@/types";
import { useMemo } from "react";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

export function RetailGregorianDateFields({
  value,
  onChange,
  disabled,
}: {
  value: ISODateString;
  onChange: (next: ISODateString) => void;
  disabled?: boolean;
}) {
  const referenceDate = todayISODate();
  const parts = parseGregorianDate(value);
  const yearOptions = useMemo(
    () => getRetailHouseGregorianYearOptions(referenceDate),
    [referenceDate],
  );
  const dayOptions = useMemo(() => {
    const maxDay = getDaysInGregorianMonth(parts.year, parts.month);
    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [parts.month, parts.year]);

  function update(next: Partial<GregorianDateParts>) {
    const merged: GregorianDateParts = {
      year: next.year ?? parts.year,
      month: next.month ?? parts.month,
      day: clampGregorianDay(
        next.year ?? parts.year,
        next.month ?? parts.month,
        next.day ?? parts.day,
      ),
    };
    const iso = `${merged.year}-${String(merged.month).padStart(2, "0")}-${String(merged.day).padStart(2, "0")}` as ISODateString;
    onChange(iso);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="block space-y-1.5">
        <span className="text-[0.8125rem] font-medium text-[#86868b]">西元年</span>
        <select
          className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
          disabled={disabled}
          onChange={(event) => update({ year: Number(event.target.value) })}
          value={parts.year}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-[0.8125rem] font-medium text-[#86868b]">月</span>
        <select
          className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
          disabled={disabled}
          onChange={(event) => update({ month: Number(event.target.value) })}
          value={parts.month}
        >
          {MONTH_OPTIONS.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-[0.8125rem] font-medium text-[#86868b]">日</span>
        <select
          className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
          disabled={disabled}
          onChange={(event) => update({ day: Number(event.target.value) })}
          value={parts.day}
        >
          {dayOptions.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
