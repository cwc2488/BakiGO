import { resolvePointsWeekRange, isDateWithinWeek } from "@/lib/points/week-range";
import type { GamificationEvent, Points } from "@/types/gamification";
import type { PointRedemption } from "@/types/points";
import type { BusinessRulesConfig } from "../rules";
import { DEFAULT_BUSINESS_RULES } from "../rules";
import { resolveStreakMultiplier } from "@/lib/points/streak-multiplier";

function toDateOnly(isoDate: string | null | undefined): string | null {
  if (typeof isoDate !== "string" || isoDate.length < 10) {
    return null;
  }
  return isoDate.slice(0, 10);
}

function previousDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return toDateOnly(date.toISOString()) ?? isoDate;
}

function resolveBasePoints(
  event: GamificationEvent,
  rules: BusinessRulesConfig,
): number {
  const reward = rules.gamification.points.eventRewards.find(
    (item) => item.eventSource === event.eventSource && item.eventKey === event.eventKey,
  );

  return reward?.points ?? 0;
}

function computeStreakOnDate(activeDates: string[], targetDate: string): number {
  if (!activeDates.includes(targetDate)) {
    return 0;
  }

  let streak = 1;
  let cursor = targetDate;
  const index = activeDates.indexOf(targetDate);

  for (let i = index - 1; i >= 0; i -= 1) {
    const expectedPrevious = previousDate(cursor);
    if (activeDates[i] === expectedPrevious) {
      streak += 1;
      cursor = activeDates[i];
    } else {
      break;
    }
  }

  return streak;
}

function sumRedemptions(
  memberId: string,
  redemptions: PointRedemption[],
): number {
  return redemptions
    .filter((item) => item.memberId === memberId)
    .reduce((sum, item) => sum + item.points, 0);
}

export interface CalculatePointsInput {
  memberId: string;
  referenceDate: string;
  yearMonth: string;
  events: GamificationEvent[];
  redemptions?: PointRedemption[];
}

export function calculatePoints(
  input: CalculatePointsInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): Points {
  const qualifyingSources = rules.gamification.streak.qualifyingEventSources;
  const activeDates = Array.from(
    new Set(
      input.events
        .filter(
          (event) =>
            qualifyingSources.includes(event.eventSource) &&
            resolveBasePoints(event, rules) > 0,
        )
        .map((event) => toDateOnly(event.eventDate))
        .filter((date): date is string => Boolean(date)),
    ),
  ).sort();

  const reference = toDateOnly(input.referenceDate);
  if (!reference) {
    return {
      memberId: input.memberId,
      lifetimePoints: 0,
      monthlyPoints: 0,
      weeklyPoints: 0,
      todayPoints: 0,
      redeemedPoints: 0,
      availablePoints: 0,
      streakMultiplier: 1,
    };
  }

  const { weekStartDate, weekEndDate } = resolvePointsWeekRange(reference);
  let lifetimePoints = 0;
  let monthlyPoints = 0;
  let weeklyPoints = 0;
  let todayPoints = 0;

  input.events.forEach((event) => {
    const basePoints = resolveBasePoints(event, rules);
    if (basePoints <= 0) {
      return;
    }

    const eventDate = toDateOnly(event.eventDate);
    if (!eventDate) {
      return;
    }
    const streakDays = computeStreakOnDate(activeDates, eventDate);
    const multiplier = resolveStreakMultiplier(Math.max(streakDays, 1));
    const earned = Math.round(basePoints * multiplier * 10) / 10;

    lifetimePoints += earned;
    if (eventDate.startsWith(input.yearMonth)) {
      monthlyPoints += earned;
    }
    if (isDateWithinWeek(eventDate, weekStartDate, weekEndDate)) {
      weeklyPoints += earned;
    }
    if (eventDate === reference) {
      todayPoints += earned;
    }
  });

  lifetimePoints = Math.round(lifetimePoints * 10) / 10;
  monthlyPoints = Math.round(monthlyPoints * 10) / 10;
  weeklyPoints = Math.round(weeklyPoints * 10) / 10;
  todayPoints = Math.round(todayPoints * 10) / 10;

  const currentStreak = computeStreakOnDate(activeDates, reference);
  const streakOnReference =
    currentStreak > 0
      ? currentStreak
      : computeStreakOnDate(activeDates, previousDate(reference));
  const streakMultiplier = resolveStreakMultiplier(Math.max(streakOnReference, 1));

  const redeemedPoints = sumRedemptions(input.memberId, input.redemptions ?? []);
  const availablePoints = Math.max(0, Math.round((lifetimePoints - redeemedPoints) * 10) / 10);

  return {
    memberId: input.memberId,
    lifetimePoints,
    monthlyPoints,
    weeklyPoints,
    todayPoints,
    redeemedPoints,
    availablePoints,
    streakMultiplier,
  };
}
