"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  LifeButton,
  LifeHeader,
  LifeInput,
  LifeSection,
  LifeSelect,
  formatLifeMoney,
} from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import type { LifeAccount, LifeCategory, LifeTransaction } from "@/types/life";
import { useCallback, useEffect, useMemo, useState } from "react";

type Mode = "expense" | "income" | "transfer";

export function LifeLedgerPage() {
  const [mode, setMode] = useState<Mode>("expense");
  const [accounts, setAccounts] = useState<LifeAccount[]>([]);
  const [categories, setCategories] = useState<LifeCategory[]>([]);
  const [transactions, setTransactions] = useState<LifeTransaction[]>([]);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");

  const refresh = useCallback(async () => {
    const [boot, txRes] = await Promise.all([
      lifeFetch<{ accounts: LifeAccount[]; categories: LifeCategory[] }>("/api/life/bootstrap"),
      lifeFetch<{ transactions: LifeTransaction[] }>("/api/life/transactions?limit=40"),
    ]);
    setAccounts(boot.accounts.filter((a) => a.status === "active"));
    setCategories(boot.categories.filter((c) => c.status === "active"));
    setTransactions(txRes.transactions);
  }, []);

  useEffect(() => {
    refresh().catch((e: Error) => setMessage(e.message));
  }, [refresh]);

  const filteredCats = useMemo(
    () => categories.filter((c) => c.kind === (mode === "income" ? "income" : "expense")),
    [categories, mode],
  );

  const assetAccounts = useMemo(
    () =>
      accounts.filter((a) =>
        ["bank", "cash", "e_payment", "goal_pocket"].includes(a.accountType),
      ),
    [accounts],
  );

  const expenseAccounts = useMemo(
    () =>
      accounts.filter((a) =>
        ["bank", "cash", "e_payment", "credit_card", "goal_pocket"].includes(a.accountType),
      ),
    [accounts],
  );

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      if (editingId) {
        await lifeFetch("/api/life/transactions", {
          method: "PATCH",
          body: JSON.stringify({
            id: editingId,
            amountYuan: amount,
            categoryId: mode === "transfer" ? null : categoryId,
            accountId,
            counterpartyAccountId: mode === "transfer" ? toAccountId : null,
            note: note || null,
          }),
        });
        setMessage("已更新");
      } else {
        await lifeFetch("/api/life/transactions", {
          method: "POST",
          body: JSON.stringify({
            kind: mode,
            amountYuan: amount,
            categoryId: mode === "transfer" ? null : categoryId,
            accountId,
            counterpartyAccountId: mode === "transfer" ? toAccountId : null,
            note: note || null,
          }),
        });
        setMessage("已記上一筆");
      }
      setAmount("");
      setNote("");
      setEditingId(null);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("確定刪除此筆？")) return;
    setBusy(true);
    try {
      await lifeFetch(`/api/life/transactions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await refresh();
      setMessage("已刪除");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    if (!newCatName.trim() || mode === "transfer") return;
    setBusy(true);
    try {
      const res = await lifeFetch<{ category: LifeCategory }>("/api/life/categories", {
        method: "POST",
        body: JSON.stringify({
          kind: mode === "income" ? "income" : "expense",
          name: newCatName.trim(),
        }),
      });
      setNewCatName("");
      setCategoryId(res.category.id);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "新增分類失敗");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(tx: LifeTransaction) {
    if (tx.kind !== "income" && tx.kind !== "expense" && tx.kind !== "transfer") return;
    setMode(tx.kind);
    setEditingId(tx.id);
    setAmount(String(tx.amountCents / 100));
    setCategoryId(tx.categoryId ?? "");
    setAccountId(tx.accountId ?? "");
    setToAccountId(tx.counterpartyAccountId ?? "");
    setNote(tx.note ?? "");
  }

  const accountName = (id: string | null) =>
    accounts.find((a) => a.id === id)?.name ?? "—";
  const catName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <div>
      <LifeHeader title="記帳" subtitle={editingId ? "編輯交易" : "收入／支出／轉帳"} />

      <div className="mx-5 flex gap-1 rounded-xl bg-[var(--life-border)]/60 p-1">
        {(["expense", "income", "transfer"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setEditingId(null);
            }}
            className={`flex-1 rounded-lg py-2 text-sm ${
              mode === m
                ? "bg-[var(--life-surface)] font-medium text-[var(--life-text)]"
                : "text-[var(--life-muted)]"
            }`}
          >
            {m === "expense" ? "支出" : m === "income" ? "收入" : "轉帳"}
          </button>
        ))}
      </div>

      <LifeSection title="新增">
        <div className="space-y-3">
          <LifeInput
            inputMode="decimal"
            placeholder="金額"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
          {mode !== "transfer" ? (
            <>
              <LifeSelect
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">選擇分類</option>
                {filteredCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </LifeSelect>
              <div className="flex gap-2">
                <LifeInput
                  placeholder="新增分類"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <LifeButton variant="ghost" onClick={addCategory} disabled={busy}>
                  新增
                </LifeButton>
              </div>
            </>
          ) : null}
          <LifeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">
              {mode === "transfer" ? "從帳戶" : mode === "income" ? "進入帳戶" : "從帳戶扣款"}
            </option>
            {(mode === "transfer" ? assetAccounts : mode === "income" ? assetAccounts : expenseAccounts).map(
              (a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ),
            )}
          </LifeSelect>
          {mode === "transfer" ? (
            <LifeSelect value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">轉入帳戶</option>
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
            placeholder="備註（選填）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <LifeButton className="w-full" onClick={submit} disabled={busy}>
            {editingId ? "儲存修改" : "完成"}
          </LifeButton>
          {editingId ? (
            <LifeButton
              variant="ghost"
              className="w-full"
              onClick={() => {
                setEditingId(null);
                setAmount("");
                setNote("");
              }}
            >
              取消編輯
            </LifeButton>
          ) : null}
          {message ? (
            <p className="text-center text-sm text-[var(--life-accent)]">{message}</p>
          ) : null}
        </div>
      </LifeSection>

      <LifeSection title="最近紀錄">
        <ul className="divide-y divide-[var(--life-border)] rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)]">
          {transactions.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[var(--life-muted)]">尚無紀錄</li>
          ) : (
            transactions.map((tx) => (
              <li key={tx.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => startEdit(tx)}
                >
                  <p className="text-sm font-medium">
                    {tx.kind === "transfer"
                      ? `${accountName(tx.accountId)} → ${accountName(tx.counterpartyAccountId)}`
                      : catName(tx.categoryId)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--life-muted)]">
                    {tx.kind === "income"
                      ? "收入"
                      : tx.kind === "expense"
                        ? "支出"
                        : tx.kind === "transfer"
                          ? "轉帳"
                          : tx.kind === "credit_payment"
                            ? "信用卡繳款"
                            : "退款"}{" "}
                    · {accountName(tx.accountId)} ·{" "}
                    {new Date(tx.occurredAt).toLocaleString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </button>
                <div className="text-right">
                  <p
                    className={`text-sm font-medium ${
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
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-[var(--life-muted)]"
                    onClick={() => remove(tx.id)}
                  >
                    刪除
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </LifeSection>
    </div>
  );
}
