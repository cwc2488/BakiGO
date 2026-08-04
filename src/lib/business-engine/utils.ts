import type { ISODateString, YearMonth } from "@/types";
import type { ActivityEvent } from "./types";

export function toYearMonth(date: ISODateString): YearMonth {
  return date.slice(0, 7);
}

export function isInYearMonth(date: ISODateString, yearMonth: YearMonth): boolean {
  return toYearMonth(date) === yearMonth;
}

export function filterActivitiesByYearMonth(
  activities: ActivityEvent[],
  yearMonth: YearMonth,
): ActivityEvent[] {
  return activities.filter((activity) => isInYearMonth(activity.activityDate, yearMonth));
}

export function filterActivitiesByMember(
  activities: ActivityEvent[],
  memberId: string,
): ActivityEvent[] {
  return activities.filter((activity) => activity.memberId === memberId);
}

export function countActivitiesByKey(
  activities: ActivityEvent[],
  activityKey: string,
): number {
  return activities.reduce(
    (total, activity) => (activity.activityKey === activityKey ? total + 1 : total),
    0,
  );
}

export function sumActivityValues(
  activities: ActivityEvent[],
  activityKey: string,
): number {
  return activities.reduce((total, activity) => {
    if (activity.activityKey !== activityKey) {
      return total;
    }
    return total + (activity.value ?? 1);
  }, 0);
}

export function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function calculateWeightedProgress(
  items: Array<{ progressPercent: number | null; weight: number }>,
): number | null {
  const validItems = items.filter(
    (item): item is { progressPercent: number; weight: number } =>
      item.progressPercent !== null,
  );

  if (validItems.length === 0) {
    return null;
  }

  const totalWeight = validItems.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) {
    return null;
  }

  const weightedSum = validItems.reduce(
    (sum, item) => sum + item.progressPercent * item.weight,
    0,
  );

  return clampPercent(weightedSum / totalWeight);
}

export function criterionProgress(
  currentValue: number,
  targetValue: number | null,
): number | null {
  if (targetValue === null || targetValue === undefined || Number.isNaN(targetValue)) {
    return null;
  }
  if (targetValue <= 0) {
    return currentValue > 0 ? 100 : 0;
  }
  return clampPercent((currentValue / targetValue) * 100);
}

export function resolveMetricValue(
  currentCount: number,
  priorCount: number,
): number | null {
  if (priorCount === 0) {
    return currentCount > 0 ? 100 : 0;
  }
  return ((currentCount - priorCount) / priorCount) * 100;
}

export function daysSinceLastActivity(
  activities: ActivityEvent[],
  referenceDate: ISODateString,
): number | null {
  if (activities.length === 0) {
    return null;
  }

  const latest = activities.reduce((max, activity) =>
    activity.activityDate > max ? activity.activityDate : max,
  activities[0].activityDate);

  const latestMs = Date.parse(latest);
  const referenceMs = Date.parse(referenceDate);

  if (Number.isNaN(latestMs) || Number.isNaN(referenceMs)) {
    return null;
  }

  const diffMs = referenceMs - latestMs;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function getDirectDownline<T extends { id: string; sponsorMemberId?: string }>(
  members: T[],
  sponsorMemberId: string,
): T[] {
  return members.filter((member) => member.sponsorMemberId === sponsorMemberId);
}

export function collectDownlineIds(
  members: Array<{ id: string; sponsorMemberId?: string }>,
  rootMemberId: string,
): Set<string> {
  const downlineIds = new Set<string>();
  const queue = getDirectDownline(members, rootMemberId).map((member) => member.id);

  while (queue.length > 0) {
    const memberId = queue.shift();
    if (!memberId || downlineIds.has(memberId)) {
      continue;
    }
    downlineIds.add(memberId);
    getDirectDownline(members, memberId).forEach((member) => queue.push(member.id));
  }

  return downlineIds;
}
