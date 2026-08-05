import type { ISODateString } from "@/types";

export function shiftISODate(date: ISODateString, offsetDays: number): ISODateString {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + offsetDays);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Rolling 7-day window ending on referenceDate (same as retail house week). */
export function resolvePointsWeekRange(referenceDate: ISODateString): {
  weekStartDate: ISODateString;
  weekEndDate: ISODateString;
} {
  return {
    weekStartDate: shiftISODate(referenceDate, -6),
    weekEndDate: referenceDate,
  };
}

export function isDateWithinWeek(
  date: ISODateString,
  weekStartDate: ISODateString,
  weekEndDate: ISODateString,
): boolean {
  return date >= weekStartDate && date <= weekEndDate;
}
