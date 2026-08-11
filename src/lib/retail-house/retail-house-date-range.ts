import type { ISODateString } from "@/types";

export const RETAIL_HOUSE_RETENTION_YEARS = 2;

export type RetailHouseDateRangePreset = "week" | "month" | "custom";

export interface RetailHouseDateRange {
  preset: RetailHouseDateRangePreset;
  startDate: ISODateString;
  endDate: ISODateString;
}

function shiftDate(date: ISODateString, offsetDays: number): ISODateString {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + offsetDays);
  return parsed.toISOString().slice(0, 10) as ISODateString;
}

function monthStart(date: ISODateString): ISODateString {
  return `${date.slice(0, 7)}-01` as ISODateString;
}

function monthEnd(date: ISODateString): ISODateString {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, "0")}` as ISODateString;
}

export function getRetailHouseRetentionMinDate(referenceDate: ISODateString): ISODateString {
  const parsed = new Date(`${referenceDate}T12:00:00`);
  parsed.setFullYear(parsed.getFullYear() - RETAIL_HOUSE_RETENTION_YEARS);
  return parsed.toISOString().slice(0, 10) as ISODateString;
}

export function getRetailHouseGregorianYearOptions(referenceDate: ISODateString): number[] {
  const maxYear = Number(referenceDate.slice(0, 4));
  const minYear = Number(getRetailHouseRetentionMinDate(referenceDate).slice(0, 4));
  const years: number[] = [];
  for (let year = maxYear; year >= minYear; year -= 1) {
    years.push(year);
  }
  return years;
}

export function validateRetailHouseDateRange(
  startDate: ISODateString,
  endDate: ISODateString,
  referenceDate: ISODateString,
): string | null {
  if (startDate > endDate) {
    return "開始日期不可晚於結束日期。";
  }
  const minDate = getRetailHouseRetentionMinDate(referenceDate);
  if (startDate < minDate) {
    return `紀錄至少保留 ${RETAIL_HOUSE_RETENTION_YEARS} 年，最早可選 ${minDate.slice(0, 4)} 年。`;
  }
  if (endDate > referenceDate) {
    return "結束日期不可晚於今天。";
  }
  return null;
}

export function resolveRetailHouseDateRange(
  preset: RetailHouseDateRangePreset,
  referenceDate: ISODateString,
  customStart?: ISODateString,
  customEnd?: ISODateString,
): RetailHouseDateRange {
  if (preset === "month") {
    return {
      preset,
      startDate: monthStart(referenceDate),
      endDate: monthEnd(referenceDate),
    };
  }

  if (preset === "custom" && customStart && customEnd) {
    return {
      preset,
      startDate: customStart,
      endDate: customEnd,
    };
  }

  return {
    preset: "week",
    startDate: shiftDate(referenceDate, -6),
    endDate: referenceDate,
  };
}
