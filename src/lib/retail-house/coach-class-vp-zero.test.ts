import { describe, expect, it } from "vitest";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import { validateRetailTransactionMutation } from "@/lib/retail-house/retail-transaction-validation";
import { resolveRetailVpFromTransaction } from "@/lib/retail-house/resolve-transaction-points";
import type { RetailTransaction } from "@/types/retail-transaction";

const REF = "2026-08-31";

describe("教練課 / customer NTD — VP may be 0", () => {
  it("amount > 0 / VP = 0 → validation PASS", () => {
    const result = validateRetailTransactionMutation(
      {
        eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        dateParts: { year: 2026, month: 8, day: 15 },
        customerName: "教練課顧客",
        value: 1500,
        retailVp: 0,
        note: "教練課",
      },
      REF,
    );
    expect("error" in result).toBe(false);
  });

  it("amount > 0 / VP > 0 → validation PASS", () => {
    const result = validateRetailTransactionMutation(
      {
        eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
        dateParts: { year: 2026, month: 8, day: 15 },
        customerName: "教練課顧客",
        value: 3000,
        retailVp: 80,
      },
      REF,
    );
    expect("error" in result).toBe(false);
  });

  it("negative VP → validation FAIL", () => {
    const result = validateRetailTransactionMutation(
      {
        eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        dateParts: { year: 2026, month: 8, day: 15 },
        customerName: "顧客",
        value: 1500,
        retailVp: -1,
      },
      REF,
    );
    expect("error" in result).toBe(true);
  });

  it("edit VP 50 → 0 persists numeric zero (not missing)", () => {
    expect(
      resolveRetailVpFromTransaction({
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        metadata: { retailVp: 50 },
      }),
    ).toBe(50);
    expect(
      resolveRetailVpFromTransaction({
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        metadata: { retailVp: 0 },
      }),
    ).toBe(0);
  });

  it("Product VP total: 325 product + coach class 0 = 325", () => {
    const transactions: Array<
      Pick<
        RetailTransaction,
        "id" | "memberId" | "transactionTypeKey" | "transactionDate" | "amount" | "metadata"
      >
    > = [
      {
        id: "c1",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        transactionDate: "2026-08-05",
        amount: 3000,
        metadata: { retailVp: 100 },
      },
      {
        id: "c2",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
        transactionDate: "2026-08-12",
        amount: 4000,
        metadata: { retailVp: 125 },
      },
      {
        id: "m1",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-20",
        amount: 100,
      },
      {
        id: "coach",
        memberId: "m1",
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        transactionDate: "2026-08-18",
        amount: 1500,
        metadata: { retailVp: 0, note: "教練課" },
      },
    ];
    expect(
      calculateMonthlyProductVp({
        memberId: "m1",
        yearMonth: "2026-08",
        transactions,
      }),
    ).toBe(325);
  });
});
