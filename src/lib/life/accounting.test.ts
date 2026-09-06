import { describe, expect, it } from "vitest";
import {
  applyLedgerDelta,
  computeUnrecordedExpenseCents,
  goalProgressPercent,
  netExpenseCentsForStats,
  netIncomeCentsForStats,
  netWorthCents,
} from "@/lib/life/accounting";
import { formatTwdFromCents, yuanToCents } from "@/lib/life/money";
import type { LifeAccountType } from "@/types/life";

function acct(type: LifeAccountType, balanceCents: number) {
  return { accountType: type, balanceCents };
}

describe("life money", () => {
  it("converts yuan to cents without float drift", () => {
    expect(yuanToCents("1280")).toBe(128000);
    expect(yuanToCents("1280.5")).toBe(128050);
    expect(yuanToCents("1280.50")).toBe(128050);
    expect(yuanToCents(20_000)).toBe(2_000_000);
  });

  it("formats TWD from cents", () => {
    expect(formatTwdFromCents(1500000)).toBe("$15,000");
    expect(formatTwdFromCents(-500)).toBe("-$5");
  });
});

describe("life accounting invariants", () => {
  it("transfer moves assets without changing net worth", () => {
    const map = new Map([
      ["a", acct("bank", 100_000_00)],
      ["b", acct("e_payment", 0)],
    ]);
    const next = applyLedgerDelta(map, {
      kind: "transfer",
      amountCents: 2_000_00,
      accountId: "a",
      counterpartyAccountId: "b",
      direction: 1,
    });
    expect(next.get("a")!.balanceCents).toBe(98_000_00);
    expect(next.get("b")!.balanceCents).toBe(2_000_00);
    expect(
      netWorthCents([
        { accountType: "bank", balanceCents: next.get("a")!.balanceCents, status: "active" },
        { accountType: "e_payment", balanceCents: next.get("b")!.balanceCents, status: "active" },
      ]),
    ).toBe(100_000_00);
  });

  it("credit swipe adds expense + liability; payment reduces bank+liability without expense", () => {
    let map = new Map([
      ["bank", acct("bank", 50_000_00)],
      ["cc", acct("credit_card", 0)],
    ]);
    map = applyLedgerDelta(map, {
      kind: "expense",
      amountCents: 3_000_00,
      accountId: "cc",
      counterpartyAccountId: null,
      direction: 1,
    });
    expect(map.get("cc")!.balanceCents).toBe(3_000_00);
    expect(map.get("bank")!.balanceCents).toBe(50_000_00);

    map = applyLedgerDelta(map, {
      kind: "credit_payment",
      amountCents: 3_000_00,
      accountId: "bank",
      counterpartyAccountId: "cc",
      direction: 1,
    });
    expect(map.get("cc")!.balanceCents).toBe(0);
    expect(map.get("bank")!.balanceCents).toBe(47_000_00);

    const statsTx = [
      { kind: "expense" as const, amountCents: 3_000_00 },
      { kind: "credit_payment" as const, amountCents: 3_000_00 },
    ];
    expect(netExpenseCentsForStats(statsTx)).toBe(3_000_00);
    expect(netIncomeCentsForStats(statsTx)).toBe(0);
  });

  it("credit refund reduces expense stats", () => {
    expect(
      netExpenseCentsForStats([
        { kind: "expense", amountCents: 3_000_00 },
        { kind: "credit_refund", amountCents: 500_00 },
      ]),
    ).toBe(2_500_00);
  });

  it("debit-card style expense reduces bank", () => {
    const map = new Map([["future", acct("bank", 10_000_00)]]);
    const next = applyLedgerDelta(map, {
      kind: "expense",
      amountCents: 1_280_00,
      accountId: "future",
      counterpartyAccountId: null,
      direction: 1,
    });
    expect(next.get("future")!.balanceCents).toBe(8_720_00);
  });

  it("unrecorded living expense from snapshot gap", () => {
    const result = computeUnrecordedExpenseCents({
      previousNetCents: 650_000_00,
      periodIncomeCents: 0,
      periodExpenseCents: 0,
      actualNetCents: 635_000_00,
    });
    expect(result.theoreticalNetCents).toBe(650_000_00);
    expect(result.unrecordedExpenseCents).toBe(15_000_00);
  });

  it("transfers and income/expense interact correctly in unrecorded calc", () => {
    // previous 600k; income 50k; recorded expense 20k; transfer irrelevant (not in period stats)
    // theoretical = 630k; actual 625k => unrecorded 5k
    const result = computeUnrecordedExpenseCents({
      previousNetCents: 600_000_00,
      periodIncomeCents: 50_000_00,
      periodExpenseCents: 20_000_00,
      actualNetCents: 625_000_00,
    });
    expect(result.unrecordedExpenseCents).toBe(5_000_00);
  });

  it("goal progress percent", () => {
    expect(goalProgressPercent(50_000_00, 200_000_00)).toBe(25);
    expect(goalProgressPercent(10, null)).toBeNull();
  });

  it("reversing a transaction restores balances", () => {
    let map = new Map([["cash", acct("cash", 1_000_00)]]);
    map = applyLedgerDelta(map, {
      kind: "expense",
      amountCents: 350_00,
      accountId: "cash",
      counterpartyAccountId: null,
      direction: 1,
    });
    map = applyLedgerDelta(map, {
      kind: "expense",
      amountCents: 350_00,
      accountId: "cash",
      counterpartyAccountId: null,
      direction: -1,
    });
    expect(map.get("cash")!.balanceCents).toBe(1_000_00);
  });
});
