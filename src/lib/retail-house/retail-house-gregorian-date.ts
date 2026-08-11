import { getRetailHouseRetentionMinDate, RETAIL_HOUSE_RETENTION_YEARS } from "@/lib/retail-house/retail-house-date-range";
import type { ISODateString } from "@/types";

export interface GregorianDateParts {
  year: number;
  month: number;
  day: number;
}

export function parseGregorianDate(isoDate: ISODateString): GregorianDateParts {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

export function buildGregorianDate(parts: GregorianDateParts): ISODateString {
  const { year, month, day } = parts;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as ISODateString;
}

export function getDaysInGregorianMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function validateGregorianDateParts(
  parts: GregorianDateParts,
  referenceDate: ISODateString,
): string | null {
  const { year, month, day } = parts;
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    return "請選擇有效的西元年份。";
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return "請選擇有效的月份。";
  }
  const maxDay = getDaysInGregorianMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    return "請選擇有效的日期。";
  }

  const isoDate = buildGregorianDate(parts);
  const minDate = getRetailHouseRetentionMinDate(referenceDate);
  if (isoDate < minDate) {
    return `日期不可早於 ${minDate.slice(0, 4)} 年（紀錄保留 ${RETAIL_HOUSE_RETENTION_YEARS} 年）。`;
  }
  if (isoDate > referenceDate) {
    return "日期不可晚於今天。";
  }
  return null;
}

export function clampGregorianDay(year: number, month: number, day: number): number {
  return Math.min(day, getDaysInGregorianMonth(year, month));
}
