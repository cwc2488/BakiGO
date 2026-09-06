"use client";

import {
  LifeButton,
  LifeHeader,
  LifeInput,
  LifeSelect,
  formatLifeMoney,
} from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import type { LifeAccount, LifeCategory, LifeTransaction } from "@/types/life";
import { useCallback, useEffect, useMemo, useState } from "react";

type Filter = "all" | "expense" | "income" | "transfer";

/**
 * Record management center: filterable ledger with detail sheet edit/delete.
 */
export function LifeRecordsPanel({ embedded = false }: { embedded?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [accounts, setAccounts] = useState<LifeAccount[]>([]);
  const [categories, setCategories] = useState<LifeCategory[]>([]);
  const [transactions, setTransactions] = useState<LifeTransaction[]>([]);
  const [selected, setSelected] = useState<LifeTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Edit form state
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState("");

  const refresh = useCallback(async () => {
    const [boot, txRes] = await Promise.all([
      lifeFetch<{ accounts: LifeAccount[]; categories: LifeCategory[] }>(
        "/api/life/bootstrap",
      ),
      lifeFetch<{ transactions: LifeTransaction[] }>(
        "/api/life/transactions?limit=80",
      ),
    ]);
    setAccounts(boot.accounts.filter((a) => a.status === "active"));
    setCategories(boot.categories.filter((c) => c.status === "active"));
    setTransactions(txRes.transactions);
  }, []);

  useEffect(() => {
    refresh().catch((e: Error) => setMessage(e.message));
  }, [refresh]);

  const assetAccounts = useMemo(
    () =>
      accounts.filter((a) =>
        ["bank", "cash", "e_payment", "goal_pocket"].includes(a.accountType),
      ),
    [accounts],
  );

  const visible = useMemo(() => {
    if (filter === "all") {
      return transactions.filter((t) =>
        ["income", "expense", "transfer"].includes(t.kind),
      );
    }
    return transactions.filter((t) => t.kind === filter);
  }, [transactions, filter]);

  const accountName = (id: string | null) =>
    accounts.find((a) => a.id === id)?.name ?? "—";
  const catName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "—";

  function openDetail(tx: LifeTransaction) {
    if (!["income", "expense", "transfer"].includes(tx.kind)) return;
    setSelected(tx);
    setAmount(String(tx.amountCents / 100));
    setCategoryId(tx.categoryId ?? "");
    setAccountId(tx.accountId ?? "");
    setToAccountId(tx.counterpartyAccountId ?? "");
    setNote(tx.note ?? "");
    setOccurredAt(tx.occurredAt.slice(0, 16));
    setMessage(null);
  }

  async function saveEdit() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await lifeFetch("/api/life/transactions", {
        method: "PATCH",
        body: JSON.stringify({
          id: selected.id,
          amountYuan: amount,
          categoryId: selected.kind === "transfer" ? null : categoryId,
          accountId,
          counterpartyAccountId:
            selected.kind === "transfer" ? toAccountId : null,
          note: note || null,
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        }),
      });
      setSelected(null);
      setMessage("已更新");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selected) return;
    if (!confirm("確定刪除此筆？餘額將自動回滾。")) return;
    setBusy(true);
    try {
      await lifeFetch(
        `/api/life/transactions?id=${encodeURIComponent(selected.id)}`,
        { method: "DELETE" },
      );
      setSelected(null);
      setMessage("已刪除");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={embedded ? "space-y-4" : ""}>
      {!embedded ? (
        <LifeHeader title="明細" subtitle="全部／支出／收入／轉帳" />
      ) : null}

      <div className="mx-5 flex gap-1 rounded-xl bg-[var(--life-border)]/60 p-1">
        {(
          [
            ["all", "全部"],
            ["expense", "支出"],
            ["income", "收入"],
            ["transfer", "轉帳"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`flex-1 rounded-lg py-2 text-sm ${
              filter === id
                ? "bg-[var(--life-surface)] font-medium"
                : "text-[var(--life-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message ? (
        <p className="px-5 text-sm text-[var(--life-accent)]">{message}</p>
      ) : null}

      <ul className="mx-5 divide-y divide-[var(--life-border)] overflow-hidden rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)]">
        {visible.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--life-muted)]">
            尚無紀錄
          </li>
        ) : (
          visible.map((tx) => (
            <li key={tx.id}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                onClick={() => openDetail(tx)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {tx.kind === "transfer"
                      ? `↔ ${accountName(tx.accountId)} → ${accountName(tx.counterpartyAccountId)}`
                      : catName(tx.categoryId)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--life-muted)]">
                    {tx.kind === "transfer"
                      ? "帳戶轉帳"
                      : tx.kind === "income"
                        ? "收入"
                        : "支出"}{" "}
                    · {accountName(tx.accountId)} ·{" "}
                    {new Date(tx.occurredAt).toLocaleString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {tx.note ? ` · ${tx.note}` : ""}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-medium ${
                    tx.kind === "income"
                      ? "text-[var(--life-positive)]"
                      : tx.kind === "expense"
                        ? "text-[var(--life-negative)]"
                        : "text-[var(--life-text)]"
                  }`}
                >
                  {tx.kind === "income" ? "+" : tx.kind === "expense" ? "-" : ""}
                  {formatLifeMoney(tx.amountCents)}
                </p>
              </button>
            </li>
          ))
        )}
      </ul>

      {selected ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[var(--life-surface)] p-5 sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {selected.kind === "transfer"
                  ? "修改轉帳"
                  : selected.kind === "income"
                    ? "修改收入"
                    : "修改支出"}
              </h3>
              <button
                type="button"
                className="text-sm text-[var(--life-muted)]"
                onClick={() => setSelected(null)}
              >
                關閉
              </button>
            </div>
            <div className="space-y-3">
              <LifeInput
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="金額"
              />
              <LifeInput
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
              {selected.kind !== "transfer" ? (
                <LifeSelect
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">分類</option>
                  {categories
                    .filter((c) => c.kind === selected.kind)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </LifeSelect>
              ) : null}
              <LifeSelect
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">
                  {selected.kind === "transfer" ? "從帳戶" : "帳戶"}
                </option>
                {(selected.kind === "transfer" ? assetAccounts : accounts).map(
                  (a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ),
                )}
              </LifeSelect>
              {selected.kind === "transfer" ? (
                <LifeSelect
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                >
                  <option value="">到帳戶</option>
                  {assetAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </LifeSelect>
              ) : null}
              <LifeInput
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="備註"
              />
              <LifeButton className="w-full" disabled={busy} onClick={() => void saveEdit()}>
                儲存修改
              </LifeButton>
              <LifeButton
                variant="ghost"
                className="w-full text-[var(--life-negative)]"
                disabled={busy}
                onClick={() => void removeSelected()}
              >
                刪除
              </LifeButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
