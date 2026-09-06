"use client";

import { LifeButton, LifeInput, LifeSection, LifeSelect } from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import type { LifeAccount } from "@/types/life";
import { useMemo, useState } from "react";

const ASSET_TYPES = new Set(["bank", "cash", "e_payment", "goal_pocket"]);

/**
 * Primary transfer entry for Assets tab.
 * Writes a ledger transfer — never income/expense.
 */
export function LifeTransferCard({
  accounts,
  onDone,
}: {
  accounts: LifeAccount[];
  onDone: () => void;
}) {
  const assetAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.status === "active" && ASSET_TYPES.has(a.accountType),
      ),
    [accounts],
  );

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const from = assetAccounts.find((a) => a.id === fromId);
  const canSubmit =
    Boolean(fromId && toId && fromId !== toId && Number(amount) > 0) && !busy;

  async function submit() {
    if (!canSubmit) return;
    if (from && from.balanceCents < Math.round(Number(amount) * 100)) {
      setMessage("轉出帳戶餘額不足");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await lifeFetch("/api/life/transactions", {
        method: "POST",
        body: JSON.stringify({
          kind: "transfer",
          amountYuan: amount,
          accountId: fromId,
          counterpartyAccountId: toId,
          note: note.trim() || null,
        }),
      });
      setAmount("");
      setNote("");
      setMessage("轉帳完成");
      onDone();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "轉帳失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LifeSection title="帳戶轉帳">
      <div className="space-y-3">
        <LifeSelect
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          aria-label="從帳戶"
        >
          <option value="">從帳戶</option>
          {assetAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.accountType === "goal_pocket" ? "（口袋）" : ""}
            </option>
          ))}
        </LifeSelect>
        <LifeSelect
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          aria-label="到帳戶"
        >
          <option value="">到帳戶</option>
          {assetAccounts
            .filter((a) => a.id !== fromId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.accountType === "goal_pocket" ? "（口袋）" : ""}
              </option>
            ))}
        </LifeSelect>
        <LifeInput
          inputMode="decimal"
          placeholder="金額"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          aria-label="轉帳金額"
        />
        <LifeInput
          placeholder="備註（選填）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <LifeButton className="w-full" disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? "轉帳中…" : "確認轉帳"}
        </LifeButton>
        {message ? (
          <p className="text-center text-sm text-[var(--life-accent)]">{message}</p>
        ) : null}
      </div>
    </LifeSection>
  );
}
