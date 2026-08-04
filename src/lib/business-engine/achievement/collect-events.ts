import type { GamificationEvent } from "@/types/gamification";
import type { ActivityEvent } from "../types";
import {
  GAMIFICATION_EVENT_SOURCES,
  type AchievementRule,
} from "../rules/gamification";
import { ACTIVITY_KEYS } from "../rules/keys";

export interface CollectGamificationEventsInput {
  memberId: string;
  activities: ActivityEvent[];
  transactions: Array<{
    transactionDate: string;
    transactionTypeKey: string;
    amount: number;
  }>;
}

const ACTIVITY_SOURCE_MAP: Record<string, string> = {
  [ACTIVITY_KEYS.MEASUREMENT]: GAMIFICATION_EVENT_SOURCES.MEASUREMENT,
  [ACTIVITY_KEYS.CONSULTATION]: GAMIFICATION_EVENT_SOURCES.CONSULTATION,
  [ACTIVITY_KEYS.PRODUCT_SHARING]: GAMIFICATION_EVENT_SOURCES.PRODUCT_SHARING,
  [ACTIVITY_KEYS.RETAIL_HOUSE_UPDATE]: GAMIFICATION_EVENT_SOURCES.TRANSACTION,
};

export function collectGamificationEvents(
  input: CollectGamificationEventsInput,
): GamificationEvent[] {
  const events: GamificationEvent[] = [];

  input.activities.forEach((activity, index) => {
    events.push({
      id: activity.id ?? `activity-${index}`,
      memberId: input.memberId,
      eventSource:
        ACTIVITY_SOURCE_MAP[activity.activityKey] ?? activity.activityKey,
      eventKey: activity.activityKey,
      eventDate: activity.activityDate,
      value: activity.value ?? 1,
      createdAt: activity.activityDate,
    });
  });

  input.transactions.forEach((transaction, index) => {
    events.push({
      id: `transaction-${index}-${transaction.transactionDate}`,
      memberId: input.memberId,
      eventSource: GAMIFICATION_EVENT_SOURCES.TRANSACTION,
      eventKey: transaction.transactionTypeKey,
      eventDate: transaction.transactionDate,
      value: transaction.amount,
      createdAt: transaction.transactionDate,
    });
  });

  return events.sort((left, right) => left.eventDate.localeCompare(right.eventDate));
}

export function resolveTriggerMetric(
  rule: AchievementRule,
  context: {
    events: GamificationEvent[];
    vpTotal: number;
    mapActiveLines: number;
    monthlyChallengePercent: number;
    currentStreak: number;
    currentRankKey: string;
    qualifiedRankKeys: string[];
    rankLabels: Record<string, string>;
    downlineRankCounts: Record<string, number>;
    promotionQualifiedRankIds: string[];
  },
): number {
  switch (rule.eventSource) {
    case GAMIFICATION_EVENT_SOURCES.MEASUREMENT:
    case GAMIFICATION_EVENT_SOURCES.CONSULTATION:
    case GAMIFICATION_EVENT_SOURCES.PRODUCT_SHARING:
      if (rule.eventKey === "streak_days") {
        return context.currentStreak;
      }
      return context.events.filter(
        (event) =>
          event.eventSource === rule.eventSource &&
          (!rule.eventKey || event.eventKey === rule.eventKey),
      ).length;

    case GAMIFICATION_EVENT_SOURCES.TRANSACTION:
      if (rule.eventKey) {
        return context.events.filter(
          (event) =>
            event.eventSource === GAMIFICATION_EVENT_SOURCES.TRANSACTION &&
            event.eventKey === rule.eventKey,
        ).length;
      }
      return context.events.filter(
        (event) => event.eventSource === GAMIFICATION_EVENT_SOURCES.TRANSACTION,
      ).length;

    case GAMIFICATION_EVENT_SOURCES.VP:
      return context.vpTotal;

    case GAMIFICATION_EVENT_SOURCES.MAP:
      return context.mapActiveLines;

    case GAMIFICATION_EVENT_SOURCES.MONTHLY_CHALLENGE:
      return context.monthlyChallengePercent;

    case GAMIFICATION_EVENT_SOURCES.ACTIVE:
      if (rule.eventKey === context.currentRankKey) {
        return 1;
      }
      return context.currentRankKey === rule.eventKey ? 1 : 0;

    case GAMIFICATION_EVENT_SOURCES.RANK_PROMOTION:
      if (rule.eventKey && context.promotionQualifiedRankIds.includes(rule.eventKey)) {
        return 1;
      }
      return rule.eventKey && context.qualifiedRankKeys.includes(rule.eventKey)
        ? 1
        : 0;

    case "downline_rank":
      return context.downlineRankCounts[rule.eventKey ?? ""] ?? 0;

    default:
      return 0;
  }
}

export function findUnlockDate(
  rule: AchievementRule,
  events: GamificationEvent[],
  referenceDate: string,
): string {
  if (
    rule.threshold === null ||
    rule.threshold === undefined ||
    Number.isNaN(rule.threshold)
  ) {
    return referenceDate;
  }

  const threshold = rule.threshold;

  if (rule.eventSource === GAMIFICATION_EVENT_SOURCES.TRANSACTION) {
    const matching = events.filter(
      (event) => event.eventSource === GAMIFICATION_EVENT_SOURCES.TRANSACTION,
    );
    if (matching.length >= threshold) {
      return matching[threshold - 1]?.eventDate ?? referenceDate;
    }
  }

  if (
    rule.eventSource === GAMIFICATION_EVENT_SOURCES.MEASUREMENT ||
    rule.eventSource === GAMIFICATION_EVENT_SOURCES.CONSULTATION ||
    rule.eventSource === GAMIFICATION_EVENT_SOURCES.PRODUCT_SHARING
  ) {
    const matching = events.filter(
      (event) =>
        event.eventSource === rule.eventSource &&
        (!rule.eventKey || event.eventKey === rule.eventKey),
    );
    if (matching.length >= threshold) {
      return matching[threshold - 1]?.eventDate ?? referenceDate;
    }
  }

  return referenceDate;
}
