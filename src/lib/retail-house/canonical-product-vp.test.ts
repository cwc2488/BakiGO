import { describe, expect, it } from "vitest";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import {
  calculateMonthlyProductVp,
  calculateMonthlyProductVpByMemberIds,
  resolveProductVpContribution,
  sumRetailHouseMonthProductVp,
} from "@/lib/retail-house/canonical-product-vp";
import { buildRetailWeeklyReport } from "@/lib/services/build-retail-weekly-report";
import type { RetailTransaction } from "@/types/retail-transaction";

function tx(
  partial: Partial<RetailTransaction> &
    Pick<RetailTransaction, "id" | "memberId" | "transactionTypeKey" | "transactionDate" | "amount">,
): RetailTransaction {
  return {
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    organizationId: "org-1",
    customerName: "Customer",
    currencyCode: "TWD",
    ...partial,
  };
}

describe("canonical Product VP", () => {
  it("sums member VP amounts + customer retailVp for the month (325 fixture)", () => {
    const transactions = [
      tx({
        id: "a",
        memberId: "downline-a",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-05",
        amount: 100,
      }),
      tx({
        id: "b",
        memberId: "downline-a",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
        transactionDate: "2026-08-12",
        amount: 125,
      }),
      tx({
        id: "c",
        memberId: "downline-a",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        transactionDate: "2026-08-20",
        amount: 5000,
        metadata: { retailVp: 100 },
      }),
    ];

    expect(
      calculateMonthlyProductVp({
        memberId: "downline-a",
        yearMonth: "2026-08",
        transactions,
      }),
    ).toBe(325);
  });

  it("recalculates after edit and delete semantics", () => {
    let transactions = [
      tx({
        id: "a",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-05",
        amount: 100,
      }),
      tx({
        id: "b",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
        transactionDate: "2026-08-12",
        amount: 125,
      }),
      tx({
        id: "c",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        transactionDate: "2026-08-20",
        amount: 5000,
        metadata: { retailVp: 100 },
      }),
    ];

    expect(calculateMonthlyProductVp({ memberId: "m1", yearMonth: "2026-08", transactions })).toBe(
      325,
    );

    transactions = transactions.map((row) =>
      row.id === "b" ? { ...row, amount: 150 } : row,
    );
    expect(calculateMonthlyProductVp({ memberId: "m1", yearMonth: "2026-08", transactions })).toBe(
      350,
    );

    // Hard delete (Retail House semantics)
    transactions = transactions.filter((row) => row.id !== "a");
    expect(calculateMonthlyProductVp({ memberId: "m1", yearMonth: "2026-08", transactions })).toBe(
      250,
    );
  });

  it("excludes other months, void rows, and never uses gamification points", () => {
    const transactions = [
      tx({
        id: "prev",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-07-31",
        amount: 999,
      }),
      tx({
        id: "next",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-09-01",
        amount: 888,
      }),
      {
        ...tx({
          id: "voided",
          memberId: "m1",
          transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
          transactionDate: "2026-08-10",
          amount: 50,
        }),
        status: "void" as const,
      },
      tx({
        id: "ntd-no-vp",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        transactionDate: "2026-08-11",
        amount: 1200,
        // no retailVp — must stay 0 (not gamification 20)
      }),
      tx({
        id: "ok",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-15",
        amount: 40,
      }),
    ];

    expect(calculateMonthlyProductVp({ memberId: "m1", yearMonth: "2026-08", transactions })).toBe(
      40,
    );
    expect(resolveProductVpContribution(transactions[3]!)).toBe(0);
  });

  it("batches many members without N+1 formulas", () => {
    const transactions = [
      tx({
        id: "1",
        memberId: "a",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-01",
        amount: 10,
      }),
      tx({
        id: "2",
        memberId: "b",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-01",
        amount: 20,
      }),
      tx({
        id: "3",
        memberId: "a",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        transactionDate: "2026-08-02",
        amount: 100,
        metadata: { retailVp: 5 },
      }),
    ];

    const map = calculateMonthlyProductVpByMemberIds({
      memberIds: ["a", "b", "c"],
      yearMonth: "2026-08",
      transactions,
    });
    expect(map.get("a")).toBe(15);
    expect(map.get("b")).toBe(20);
    expect(map.get("c")).toBe(0);
  });

  it("matches Retail House month report Product VP total", () => {
    const transactions = [
      tx({
        id: "m",
        memberId: "member-default",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-10",
        amount: 200,
      }),
      tx({
        id: "c",
        memberId: "member-default",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        transactionDate: "2026-08-11",
        amount: 3000,
        metadata: { retailVp: 125 },
      }),
    ];

    const canonical = calculateMonthlyProductVp({
      memberId: "member-default",
      yearMonth: "2026-08",
      transactions,
    });

    const report = buildRetailWeeklyReport({
      memberId: "member-default",
      referenceDate: "2026-08-31",
      yearMonth: "2026-08",
      transactions,
      monthlyChallenge: {
        memberId: "member-default",
        challengeId: "challenge-2026-08",
        yearMonth: "2026-08",
        title: "Monthly Challenge",
        criteria: [],
        overallProgressPercent: 0,
        computedAt: "2026-08-31T00:00:00.000Z",
      },
      vp: {
        memberId: "member-default",
        yearMonth: "2026-08",
        totalVp: 200,
        byType: [
          {
            transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
            totalVp: 200,
            count: 1,
          },
        ],
      },
      rangePreset: "month",
      rangeStartDate: "2026-08-01",
      rangeEndDate: "2026-08-31",
    });

    expect(
      sumRetailHouseMonthProductVp(
        report.categories.map((category) => ({
          unit: category.unit,
          monthlyTotal: category.monthlyTotal ?? 0,
          periodPointsTotal: category.periodPointsTotal,
        })),
      ),
    ).toBe(canonical);
    expect(canonical).toBe(325);
  });

  it("returns 0 when there are no transactions", () => {
    expect(
      calculateMonthlyProductVp({
        memberId: "m1",
        yearMonth: "2026-08",
        transactions: [],
      }),
    ).toBe(0);
  });
});
