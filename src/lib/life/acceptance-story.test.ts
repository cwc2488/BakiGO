import { describe, expect, it } from "vitest";
import {
  applyLedgerDelta,
  computeUnrecordedExpenseCents,
  goalProgressPercent,
  netExpenseCentsForStats,
  netIncomeCentsForStats,
  netWorthCents,
} from "@/lib/life/accounting";
import type { LifeAccountType } from "@/types/life";

type Acct = { accountType: LifeAccountType; balanceCents: number };

function nw(map: Map<string, Acct>) {
  return netWorthCents(
    [...map.entries()].map(([, a]) => ({
      accountType: a.accountType,
      balanceCents: a.balanceCents,
      status: "active" as const,
    })),
  );
}

/** End-to-end accounting story covering acceptance invariants. */
describe("life acceptance story", () => {
  it("covers income/expense/transfer/pocket/snapshot/unrecorded/cc", () => {
    let map = new Map<string, Acct>([
      ["ctbc", { accountType: "bank", balanceCents: 500_000_00 }],
      ["esun", { accountType: "bank", balanceCents: 100_000_00 }],
      ["future", { accountType: "bank", balanceCents: 50_000_00 }],
      ["cash", { accountType: "cash", balanceCents: 5_000_00 }],
      ["jko", { accountType: "e_payment", balanceCents: 2_000_00 }],
      ["pocket", { accountType: "goal_pocket", balanceCents: 50_000_00 }],
    ]);
    const snap0 = nw(map);
    expect(snap0).toBe(707_000_00);

    // income
    map = applyLedgerDelta(map, {
      kind: "income",
      amountCents: 30_000_00,
      accountId: "ctbc",
      counterpartyAccountId: null,
      direction: 1,
    });
    // expense from jko
    map = applyLedgerDelta(map, {
      kind: "expense",
      amountCents: 350_00,
      accountId: "jko",
      counterpartyAccountId: null,
      direction: 1,
    });
    // transfer bank -> e-pay (not expense)
    map = applyLedgerDelta(map, {
      kind: "transfer",
      amountCents: 2_000_00,
      accountId: "ctbc",
      counterpartyAccountId: "jko",
      direction: 1,
    });
    // transfer to goal pocket
    map = applyLedgerDelta(map, {
      kind: "transfer",
      amountCents: 10_000_00,
      accountId: "future",
      counterpartyAccountId: "pocket",
      direction: 1,
    });

    const periodTx = [
      { kind: "income" as const, amountCents: 30_000_00 },
      { kind: "expense" as const, amountCents: 350_00 },
      { kind: "transfer" as const, amountCents: 2_000_00 },
      { kind: "transfer" as const, amountCents: 10_000_00 },
    ];
    expect(netIncomeCentsForStats(periodTx)).toBe(30_000_00);
    expect(netExpenseCentsForStats(periodTx)).toBe(350_00);
    // transfers do not change net
    expect(nw(map)).toBe(snap0 + 30_000_00 - 350_00);

    // goal progress
    expect(goalProgressPercent(map.get("pocket")!.balanceCents, 200_000_00)).toBe(30);

    // unrecorded: actual lower than theoretical by 15k
    const theoretical = computeUnrecordedExpenseCents({
      previousNetCents: snap0,
      periodIncomeCents: 30_000_00,
      periodExpenseCents: 350_00,
      actualNetCents: snap0 + 30_000_00 - 350_00 - 15_000_00,
    });
    expect(theoretical.unrecordedExpenseCents).toBe(15_000_00);

    // credit card future path
    map.set("visa", { accountType: "credit_card", balanceCents: 0 });
    map = applyLedgerDelta(map, {
      kind: "expense",
      amountCents: 3_000_00,
      accountId: "visa",
      counterpartyAccountId: null,
      direction: 1,
    });
    expect(netExpenseCentsForStats([{ kind: "expense", amountCents: 3_000_00 }])).toBe(3_000_00);
    map = applyLedgerDelta(map, {
      kind: "credit_payment",
      amountCents: 3_000_00,
      accountId: "ctbc",
      counterpartyAccountId: "visa",
      direction: 1,
    });
    expect(map.get("visa")!.balanceCents).toBe(0);
    expect(
      netExpenseCentsForStats([
        { kind: "expense", amountCents: 3_000_00 },
        { kind: "credit_payment", amountCents: 3_000_00 },
      ]),
    ).toBe(3_000_00);
  });
});
