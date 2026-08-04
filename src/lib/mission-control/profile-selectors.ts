import { QUALIFICATION_METRICS } from "@/lib/business-engine/rules/qualification";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import type { QualificationConditionResult } from "@/lib/business-engine/qualification/types";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { EventTimelineEntry } from "@/types/event-center";

export interface ProfileOrganizationCounts {
  worldTeam: number | null;
  promotionGroup: number | null;
  wealthGroup: number | null;
  president: number | null;
}

export interface ProfileBusinessMetrics {
  monthlyTransactions: number;
  monthlyRetailAmount: number;
  monthlyVp: number;
  newCustomer: number | null;
  returningCustomer: number | null;
  newMemberVp: number | null;
  returningMemberVp: number | null;
}

function collectQualificationMetricValues(
  node: QualificationConditionResult,
  values: Partial<Record<string, number | null>>,
): void {
  if (node.metric !== "composite" && node.current !== null) {
    values[node.metric] = node.current;
  }

  node.children?.forEach((child) => collectQualificationMetricValues(child, values));
}

export function selectOrganizationCounts(
  metrics: MemberComputedMetrics,
): ProfileOrganizationCounts {
  const values: Partial<Record<string, number | null>> = {};

  metrics.qualificationResults.forEach((result) => {
    collectQualificationMetricValues(result.root, values);
  });

  return {
    worldTeam: values[QUALIFICATION_METRICS.WORLD_TEAM_COUNT] ?? null,
    promotionGroup: values[QUALIFICATION_METRICS.EXPANSION_TEAM_COUNT] ?? null,
    wealthGroup: values[QUALIFICATION_METRICS.MILLIONAIRE_TEAM_COUNT] ?? null,
    president: values[QUALIFICATION_METRICS.PRESIDENT_TEAM_COUNT] ?? null,
  };
}

function findCategoryMonthlyTotal(
  metrics: MemberComputedMetrics,
  transactionTypeKey: string,
): number | null {
  const category = metrics.retailWeeklyReport.categories.find(
    (item) => item.transactionTypeKey === transactionTypeKey,
  );
  return category?.monthlyTotal ?? null;
}

export function selectBusinessMetrics(
  metrics: MemberComputedMetrics,
): ProfileBusinessMetrics {
  const house = metrics.retailHouse.houses[0];

  return {
    monthlyTransactions: house?.transactionCount ?? 0,
    monthlyRetailAmount: house?.totalAmount ?? 0,
    monthlyVp: metrics.vp.totalVp,
    newCustomer: findCategoryMonthlyTotal(
      metrics,
      RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    ),
    returningCustomer: findCategoryMonthlyTotal(
      metrics,
      RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
    ),
    newMemberVp: findCategoryMonthlyTotal(
      metrics,
      RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    ),
    returningMemberVp: findCategoryMonthlyTotal(
      metrics,
      RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
    ),
  };
}

export function selectProfileTimelineFromEvents(
  metrics: MemberComputedMetrics,
): EventTimelineEntry[] {
  return metrics.eventCenter.events;
}
