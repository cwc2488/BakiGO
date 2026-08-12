import { describe, expect, it } from "vitest";
import {
  getRetailHouseRetentionMinDate,
  resolveRetailHouseDateRange,
  validateRetailHouseDateRange,
} from "@/lib/retail-house/retail-house-date-range";
import {
  buildGregorianDate,
  validateGregorianDateParts,
} from "@/lib/retail-house/retail-house-gregorian-date";
import { resolveTransactionPoints } from "@/lib/retail-house/resolve-transaction-points";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import { buildRetailWeeklyReport } from "@/lib/services/build-retail-weekly-report";
import type { RetailTransaction } from "@/types/retail-transaction";

describe("retail-house date range", () => {
  it("keeps at least 2 years of retention", () => {
    expect(getRetailHouseRetentionMinDate("2026-08-11")).toBe("2024-08-11");
  });

  it("rejects ranges older than retention window", () => {
    expect(
      validateRetailHouseDateRange("2023-01-01", "2023-01-31", "2026-08-11"),
    ).toContain("2 年");
  });

  it("resolves week and month presets", () => {
    expect(resolveRetailHouseDateRange("week", "2026-08-11")).toEqual({
      preset: "week",
      startDate: "2026-08-05",
      endDate: "2026-08-11",
    });
    expect(resolveRetailHouseDateRange("month", "2026-08-11")).toEqual({
      preset: "month",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
  });
});

describe("retail-house gregorian date", () => {
  it("validates western calendar dates within retention", () => {
    expect(
      validateGregorianDateParts({ year: 2026, month: 8, day: 11 }, "2026-08-11"),
    ).toBeNull();
    expect(
      validateGregorianDateParts({ year: 2023, month: 1, day: 1 }, "2026-08-11"),
    ).toContain("2024");
  });

  it("builds ISO dates from parts", () => {
    expect(buildGregorianDate({ year: 2026, month: 8, day: 5 })).toBe("2026-08-05");
  });
});

describe("retail transaction VP", () => {
  it("keeps gamification reward lookup separate from retail VP", () => {
    expect(resolveTransactionPoints(RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD)).toBe(20);
    expect(resolveTransactionPoints(RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD)).toBe(25);
  });

  it("reads user-entered retailVp from metadata, not gamification points", () => {
    const transactions: RetailTransaction[] = [
      {
        id: "tx-1",
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
        organizationId: "org-default",
        memberId: "member-default",
        customerName: "Amy",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        transactionDate: "2026-08-10",
        amount: 1200,
        currencyCode: "TWD",
        metadata: { retailVp: 50 },
      },
      {
        id: "tx-2",
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
        organizationId: "org-default",
        memberId: "member-default",
        customerName: "Ben",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
        transactionDate: "2026-08-11",
        amount: 800,
        currencyCode: "TWD",
        // legacy row without retailVp — must not invent gamification points as VP
      },
    ];

    const report = buildRetailWeeklyReport({
      memberId: "member-default",
      referenceDate: "2026-08-11",
      yearMonth: "2026-08",
      transactions,
      monthlyChallenge: {
        memberId: "member-default",
        challengeId: "challenge-2026-08",
        yearMonth: "2026-08",
        title: "Monthly Challenge",
        criteria: [],
        overallProgressPercent: 0,
        computedAt: "2026-08-11T00:00:00.000Z",
      },
      vp: {
        memberId: "member-default",
        yearMonth: "2026-08",
        totalVp: 0,
        byType: [],
      },
      rangePreset: "week",
    });

    const newCustomer = report.categories.find(
      (category) => category.transactionTypeKey === RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    );
    const returningCustomer = report.categories.find(
      (category) =>
        category.transactionTypeKey === RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
    );

    expect(newCustomer?.weeklyItems[0]?.points).toBe(50);
    expect(returningCustomer?.weeklyItems[0]?.points).toBeUndefined();
    expect(newCustomer?.periodPointsTotal).toBe(50);
    expect(returningCustomer?.periodPointsTotal).toBe(0);
  });
});
