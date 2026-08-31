import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { loadAuthoritativeRetailTransactions } from "@/lib/retail-house/authoritative-retail-transactions";
import { buildRetailWeeklyReport } from "@/lib/services/build-retail-weekly-report";
import { buildRetailHouseSnapshot } from "@/lib/retail-house/retail-house-selectors";
import type { RetailHouseDateRange } from "@/lib/retail-house/retail-house-date-range";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { RetailHouseSnapshot } from "@/types/retail-house";
import { toYearMonthFromDate } from "@/lib/config/app-config";

/**
 * Builds a Retail House presentation snapshot for the selected date range.
 *
 * Transactions come from the authoritative RH read layer (events ∪ legacy
 * retailTransactions) — same source Partner Detail / Organization Product VP use.
 */
export function buildRetailHouseView(
  metrics: MemberComputedMetrics,
  range: RetailHouseDateRange,
  storage: StorageAdapter,
): RetailHouseSnapshot {
  const authoritative = loadAuthoritativeRetailTransactions(storage, metrics.memberId);
  const memberTransactions = authoritative.transactions.filter(
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
