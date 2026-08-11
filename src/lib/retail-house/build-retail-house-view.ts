import { createEventRepository } from "@/lib/repositories/event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import { buildRetailWeeklyReport } from "@/lib/services/build-retail-weekly-report";
import { buildRetailHouseSnapshot } from "@/lib/retail-house/retail-house-selectors";
import type { RetailHouseDateRange } from "@/lib/retail-house/retail-house-date-range";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { RetailHouseSnapshot } from "@/types/retail-house";
import { toYearMonthFromDate } from "@/lib/config/app-config";

/**
 * Builds a Retail House presentation snapshot for the selected date range.
 * Engine monthly totals still come from metrics; period items are filtered client-side.
 */
export function buildRetailHouseView(
  metrics: MemberComputedMetrics,
  range: RetailHouseDateRange,
  storage: StorageAdapter,
): RetailHouseSnapshot {
  const repository = createEventRepository(storage);
  const memberEvents = repository.getByMemberId(metrics.memberId);
  const projected = projectEventsForEngines(memberEvents);
  const memberTransactions = projected.transactions.filter(
    (transaction) => transaction.memberId === metrics.memberId,
  );

  const referenceDate = range.endDate;
  const yearMonth = toYearMonthFromDate(referenceDate);

  const report = buildRetailWeeklyReport({
    memberId: metrics.memberId,
    referenceDate,
    yearMonth,
    transactions: memberTransactions,
    monthlyChallenge: metrics.monthlyChallenge,
    vp: metrics.vp,
    rangeStartDate: range.startDate,
    rangeEndDate: range.endDate,
    rangePreset: range.preset,
  });

  return buildRetailHouseSnapshot({
    ...metrics,
    retailWeeklyReport: report,
  });
}
