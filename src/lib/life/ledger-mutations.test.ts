import { describe, expect, it } from "vitest";
import { applyLedgerDelta } from "@/lib/life/accounting";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function mapOf(
  rows: Array<[string, { accountType: "bank" | "cash" | "e_payment" | "goal_pocket" | "credit_card"; balanceCents: number }]>,
) {
  return new Map(rows.map(([id, v]) => [id, v]));
}

describe("ledger mutation invariants", () => {
  it("expense edit reverse+reapply restores then applies new account", () => {
    let bal = mapOf([
      ["A", { accountType: "bank", balanceCents: 100_000_00 }],
      ["B", { accountType: "bank", balanceCents: 50_000_00 }],
    ]);
    // create expense A -1000
    bal = applyLedgerDelta(bal, {
      kind: "expense",
      amountCents: 1000_00,
      accountId: "A",
      counterpartyAccountId: null,
      direction: 1,
    });
    expect(bal.get("A")!.balanceCents).toBe(99_000_00);

    // edit: reverse old, apply B -600
    bal = applyLedgerDelta(bal, {
      kind: "expense",
      amountCents: 1000_00,
      accountId: "A",
      counterpartyAccountId: null,
      direction: -1,
    });
    bal = applyLedgerDelta(bal, {
      kind: "expense",
      amountCents: 600_00,
      accountId: "B",
      counterpartyAccountId: null,
      direction: 1,
    });
    expect(bal.get("A")!.balanceCents).toBe(100_000_00);
    expect(bal.get("B")!.balanceCents).toBe(49_400_00);

    // delete edited expense
    bal = applyLedgerDelta(bal, {
      kind: "expense",
      amountCents: 600_00,
      accountId: "B",
      counterpartyAccountId: null,
      direction: -1,
    });
    expect(bal.get("A")!.balanceCents).toBe(100_000_00);
    expect(bal.get("B")!.balanceCents).toBe(50_000_00);
  });

  it("transfer create/edit/delete returns to original balances", () => {
    let bal = mapOf([
      ["A", { accountType: "bank", balanceCents: 100_000_00 }],
      ["B", { accountType: "bank", balanceCents: 50_000_00 }],
    ]);
    bal = applyLedgerDelta(bal, {
      kind: "transfer",
      amountCents: 10_000_00,
      accountId: "A",
      counterpartyAccountId: "B",
      direction: 1,
    });
    expect(bal.get("A")!.balanceCents).toBe(90_000_00);
    expect(bal.get("B")!.balanceCents).toBe(60_000_00);

    // edit to 5000
    bal = applyLedgerDelta(bal, {
      kind: "transfer",
      amountCents: 10_000_00,
      accountId: "A",
      counterpartyAccountId: "B",
      direction: -1,
    });
    bal = applyLedgerDelta(bal, {
      kind: "transfer",
      amountCents: 5_000_00,
      accountId: "A",
      counterpartyAccountId: "B",
      direction: 1,
    });
    expect(bal.get("A")!.balanceCents).toBe(95_000_00);
    expect(bal.get("B")!.balanceCents).toBe(55_000_00);

    // delete
    bal = applyLedgerDelta(bal, {
      kind: "transfer",
      amountCents: 5_000_00,
      accountId: "A",
      counterpartyAccountId: "B",
      direction: -1,
    });
    expect(bal.get("A")!.balanceCents).toBe(100_000_00);
    expect(bal.get("B")!.balanceCents).toBe(50_000_00);
  });

  it("service enforces pocket zero-balance delete and transfer guards", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/life/life-service.ts"), "utf8");
    expect(src).toContain("請先將口袋餘額轉出至 0 元後才能刪除");
    expect(src).toContain("insufficient_balance");
    expect(src).toContain("assertNoNegativeAssetBalances");
    expect(src).toContain("deleteSnapshot");
    expect(src).toContain("Promise.all");
  });

  it("UI exposes transfer card and records management", () => {
    const assets = readFileSync(join(process.cwd(), "src/components/life/LifeAssetsPage.tsx"), "utf8");
    const quick = readFileSync(join(process.cwd(), "src/components/life/LifeQuickPage.tsx"), "utf8");
    const shell = readFileSync(join(process.cwd(), "src/components/life/LifeShell.tsx"), "utf8");
    expect(assets).toContain("LifeTransferCard");
    expect(quick).toContain("LifeRecordsPanel");
    expect(quick).toContain("softRefresh");
    expect(shell).toContain("LifePanelActivityProvider");
    expect(shell).toContain("queueMicrotask");
  });
});
