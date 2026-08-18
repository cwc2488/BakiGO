import type { Streak } from "@/types/gamification";
import type { BusinessRulesConfig } from "../rules";
import { DEFAULT_BUSINESS_RULES } from "../rules";
import type { GamificationEvent } from "@/types/gamification";

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

function uniqueActiveDates(
  events: GamificationEvent[],
  qualifyingSources: string[],
): string[] {
  const dates = new Set<string>();

  events.forEach((event) => {
    if (!qualifyingSources.includes(event.eventSource)) {
      return;
    }
    const date = toDateOnly(event.eventDate);
    if (date) {
      dates.add(date);
    }
  });

  return Array.from(dates).sort();
}

function computeLongestStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) {
    return 0;
  }

  let longest = 1;
  let current = 1;

  for (let index = 1; index < sortedDates.length; index += 1) {
    const expectedPrevious = previousDate(sortedDates[index]);
    if (sortedDates[index - 1] === expectedPrevious) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function computeCurrentStreak(sortedDates: string[], referenceDate: string): number {
  if (sortedDates.length === 0) {
    return 0;
  }

  const reference = toDateOnly(referenceDate);
  const lastDate = sortedDates[sortedDates.length - 1];
  if (!reference) {
    return 0;
  }
  const dayBeforeReference = previousDate(reference);

  if (lastDate !== reference && lastDate !== dayBeforeReference) {
    return 0;
  }

  let streak = 1;
  let cursor = lastDate;

  for (let index = sortedDates.length - 2; index >= 0; index -= 1) {
    const expectedPrevious = previousDate(cursor);
    if (sortedDates[index] === expectedPrevious) {
      streak += 1;
      cursor = sortedDates[index];
    } else {
      break;
    }
  }

  return streak;
}

export function calculateStreak(
  memberId: string,
  events: GamificationEvent[],
  referenceDate: string,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): Streak {
  const qualifyingSources = rules.gamification.streak.qualifyingEventSources;
  const activeDates = uniqueActiveDates(events, qualifyingSources);
  const lastActiveDate = activeDates[activeDates.length - 1] ?? null;
  const reference = toDateOnly(referenceDate);
  if (!reference) {
    return {
      memberId,
      currentStreak: 0,
      longestStreak: computeLongestStreak(activeDates),
      lastActiveDate,
      isActiveToday: false,
    };
  }

  return {
    memberId,
    currentStreak: computeCurrentStreak(activeDates, reference),
    longestStreak: computeLongestStreak(activeDates),
    lastActiveDate,
    isActiveToday: lastActiveDate === reference,
  };
}
