"use client";

import { useLifeData } from "@/components/life/LifeDataProvider";
import { LifeButton, LifeHeader, LifeSelect } from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Kind = "expense" | "income";

export function LifeQuickPage() {
  const {
    accounts,
    expenseCategories,
    incomeCategories,
    lastExpenseAccountId,
    lastIncomeAccountId,
    loading,
    error,
    invalidate,
  } = useLifeData();

  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const categories = kind === "expense" ? expenseCategories : incomeCategories;

  useEffect(() => {
    const t = window.setTimeout(() => amountRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!accounts.length) return;
    const preferred = kind === "expense" ? lastExpenseAccountId : lastIncomeAccountId;
    setAccountId((prev) => {
      if (prev && accounts.some((a) => a.id === prev)) return prev;
      if (preferred && accounts.some((a) => a.id === preferred)) return preferred;
      return (
        accounts.find((a) => a.accountType !== "credit_card")?.id ??
        accounts[0]?.id ??
        ""
      );
    });
  }, [accounts, kind, lastExpenseAccountId, lastIncomeAccountId]);

  useEffect(() => {
    if (!categories.length) {
      setCategoryId("");
      return;
    }
    setCategoryId((prev) =>
      prev && categories.some((c) => c.id === prev) ? prev : (categories[0]?.id ?? ""),
    );
  }, [categories, kind]);

  const canSubmit = useMemo(
    () => Boolean(amount && Number(amount) > 0 && categoryId && accountId && !busy),
    [amount, categoryId, accountId, busy],
  );

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setLocalError(null);
    setMessage(null);
    try {
      await lifeFetch("/api/life/transactions", {
        method: "POST",
        body: JSON.stringify({
          kind,
          amountYuan: amount,
          categoryId,
          accountId,
          note: note.trim() || undefined,
        }),
      });
      setMessage(kind === "expense" ? "已記一筆支出" : "已記一筆收入");
      setAmount("");
      setNote("");
      invalidate();
      amountRef.current?.focus();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "記帳失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <LifeHeader
        title="快速記帳"
        subtitle="打開就能記，記完再記下一筆"
        right={
          <Link
            href="/life/ledger"
            className="rounded-full border border-[var(--brand-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--brand-text-secondary)]"
          >
            明細
          </Link>
        }
      />

      <div className="mx-5 rounded-2xl bg-[var(--brand-primary-muted)] p-1">
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              ["expense", "支出"],
              ["income", "收入"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`min-h-11 rounded-xl text-sm font-semibold transition ${
                kind === value
                  ? "bg-white text-[var(--brand-text)] shadow-sm"
                  : "text-[var(--brand-text-secondary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-5">
        <label className="text-xs font-medium text-[var(--brand-text-muted)]">金額</label>
        <div className="mt-2 flex items-baseline gap-2 border-b border-[var(--brand-border)] pb-2">
          <span className="text-2xl font-semibold text-[var(--brand-text-muted)]">$</span>
          <input
            ref={amountRef}
            inputMode="decimal"
            type="text"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            className="w-full bg-transparent text-5xl font-semibold tracking-tight text-[var(--brand-text)] outline-none placeholder:text-[var(--brand-border)]"
            aria-label="金額"
          />
        </div>
      </div>

      <div className="mx-5 space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--brand-text-muted)]">分類</label>
          <LifeSelect
            className="mt-1.5"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={loading || categories.length === 0}
          >
            {loading ? <option value="">載入中…</option> : null}
            {!loading && categories.length === 0 ? <option value="">尚無分類</option> : null}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </LifeSelect>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--brand-text-muted)]">帳戶</label>
          <LifeSelect
            className="mt-1.5"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={loading || accounts.length === 0}
          >
            {loading ? <option value="">載入中…</option> : null}
            {!loading && accounts.length === 0 ? <option value="">尚無帳戶</option> : null}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </LifeSelect>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--brand-text-muted)]">備註（選填）</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：午餐"
            className="mt-1.5 w-full rounded-2xl border border-[var(--brand-border)] bg-white px-3 py-2.5 text-base text-[var(--brand-text)] outline-none focus:border-[var(--brand-primary)]"
          />
        </div>
      </div>

      {(error || localError) && (
        <p className="mx-5 text-sm text-[var(--life-negative)]">{error || localError}</p>
      )}
      {message && (
        <p className="mx-5 text-sm font-medium text-[var(--brand-primary-dark)]">{message}</p>
      )}

      <div className="mx-5">
        <LifeButton
          className="min-h-12 w-full text-base"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {busy ? "記錄中…" : "記錄"}
        </LifeButton>
      </div>
    </div>
  );
}
