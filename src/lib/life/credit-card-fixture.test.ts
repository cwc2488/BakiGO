import { describe, expect, it } from "vitest";
import { applyLedgerDelta, netExpenseCentsForStats, netWorthCents } from "@/lib/life/accounting";
import type { LifeAccountType } from "@/types/life";

type Acct = { accountType: LifeAccountType; balanceCents: number };

/**
 * Future credit-card fixture: swipe / pay / refund invariants
 * (pure ledger — no DB).
 */
describe("life credit card fixture", () => {
  it("swipe adds expense + liability; payment reduces bank + liability; no second expense", () => {
    let map = new Map<string, Acct>([
      ["ctbc", { accountType: "bank", balanceCents: 100_000_00 }],
      ["visa", { accountType: "credit_card", balanceCents: 0 }],
    ]);

    map = applyLedgerDelta(map, {
      kind: "expense",
      amountCents: 3_000_00,
      accountId: "visa",
      counterpartyAccountId: null,
      direction: 1,
    });

    expect(map.get("visa")!.balanceCents).toBe(3_000_00);
    expect(
      netWorthCents([
        { accountType: "bank", balanceCents: map.get("ctbc")!.balanceCents, status: "active" },
        {
          accountType: "credit_card",
          balanceCents: map.get("visa")!.balanceCents,
          status: "active",
        },
      ]),
    ).toBe(97_000_00);

    map = applyLedgerDelta(map, {
      kind: "credit_payment",
      amountCents: 3_000_00,
      accountId: "ctbc",
      counterpartyAccountId: "visa",
      direction: 1,
    });

    expect(map.get("ctbc")!.balanceCents).toBe(97_000_00);
    expect(map.get("visa")!.balanceCents).toBe(0);
    expect(
      netExpenseCentsForStats([
        { kind: "expense", amountCents: 3_000_00 },
        { kind: "credit_payment", amountCents: 3_000_00 },
      ]),
    ).toBe(3_000_00);
  });

  it("partial payment and refund keep liability coherent", () => {
    let map = new Map<string, Acct>([
      ["ctbc", { accountType: "bank", balanceCents: 50_000_00 }],
      ["visa", { accountType: "credit_card", balanceCents: 28_650_00 }],
    ]);

    map = applyLedgerDelta(map, {
      kind: "credit_payment",
      amountCents: 10_000_00,
      accountId: "ctbc",
      counterpartyAccountId: "visa",
      direction: 1,
    });
    expect(map.get("visa")!.balanceCents).toBe(18_650_00);

    map = applyLedgerDelta(map, {
      kind: "credit_refund",
      amountCents: 650_00,
      accountId: "visa",
      counterpartyAccountId: null,
      direction: 1,
    });
    expect(map.get("visa")!.balanceCents).toBe(18_000_00);
  });
});
