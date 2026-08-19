import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import type { CoachingEnrollment, CoachingPlanSnapshot } from "@/types/coaching";

/** Inclusive Day 1 through Day 21. */
export const EXPERIENCE_21D_DAYS = 21 as const;

export type Experience21dSnapshot = {
  productReceivedDate: string;
  interestId?: string;
};

export type Experience21dSchedule = {
  productReceivedDate: string;
  startDate: string;
  plannedEndAt: string;
};

export function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/** Day 1 = calendar day after product received. Day 21 = start + 20 (inclusive). */
export function deriveExperience21dSchedule(productReceivedDate: string): Experience21dSchedule {
  if (!isIsoDate(productReceivedDate)) {
    throw new Error("invalid_product_received_date");
  }
  const startDate = addCalendarDays(productReceivedDate, 1);
  const plannedEndAt = addCalendarDays(startDate, EXPERIENCE_21D_DAYS - 1);
  return { productReceivedDate, startDate, plannedEndAt };
}

export function formatExperience21dZhDate(isoDate: string): string {
  const [, month, day] = isoDate.slice(0, 10).split("-");
  return `${Number(month)} 月 ${Number(day)} 日`;
}

export function formatExperience21dShortDate(isoDate: string): string {
  const [, month, day] = isoDate.slice(0, 10).split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function experience21dFromPlanSnapshot(
  snapshot: CoachingPlanSnapshot | null | undefined,
): Experience21dSnapshot | null {
  const raw = snapshot?.experience21d;
  if (!raw || !isIsoDate(raw.productReceivedDate)) return null;
  return {
    productReceivedDate: raw.productReceivedDate,
    interestId: raw.interestId,
  };
}

export function isExperience21dEnrollment(
  enrollment: Pick<CoachingEnrollment, "planSnapshot"> | null | undefined,
): boolean {
  return experience21dFromPlanSnapshot(enrollment?.planSnapshot) != null;
}

export function withExperience21dSnapshot(
  snapshot: CoachingPlanSnapshot,
  experience21d: Experience21dSnapshot,
): CoachingPlanSnapshot {
  return { ...snapshot, experience21d };
}

export function shouldCompleteExperience21d(input: {
  enrollment: Pick<CoachingEnrollment, "status" | "plannedEndAt" | "startedAt" | "planSnapshot">;
  todayIso: string;
}): boolean {
  if (!isExperience21dEnrollment(input.enrollment)) return false;
  if (input.enrollment.status === "completed") return false;
  const end = input.enrollment.plannedEndAt?.slice(0, 10);
  if (!isIsoDate(end) || !isIsoDate(input.todayIso)) return false;
  return input.todayIso > end;
}

export function safe21dReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null;
  const path = raw.split("?")[0] ?? "";
  if (path.startsWith("/quiz/21d/") || path.startsWith("/customers/")) return path;
  return null;
}
