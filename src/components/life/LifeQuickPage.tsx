"use client";

import { LifeButton } from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import type { LifeAccount, LifeCategory } from "@/types/life";
import { useEffect, useRef, useState } from "react";

/**
 * Ultra-light quick expense entry for home-screen PWA.
 * Intentionally avoids dashboard aggregates and heavy modules.
 */
export function LifeQuickPage() {
  const [categories, setCategories] = useState<LifeCategory[]>([]);
  const [accounts, setAccounts] = useState<LifeAccount[]>([]);
  const [lastAccountId, setLastAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedLabel, setLastSavedLabel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    lifeFetch<{
      categories: LifeCategory[];
      accounts: LifeAccount[];
      lastExpenseAccountId: string | null;
    }>("/api/life/quick")
      .then((d) => {
        if (cancelled) return;
        setCategories(d.categories);
        setAccounts(d.accounts);
        setLastAccountId(d.lastExpenseAccountId);
        if (d.categories[0]) setCategoryId(d.categories[0].id);
        const preferred =
          d.accounts.find((a) => a.id === d.lastExpenseAccountId)?.id ??
          d.accounts.find((a) => a.accountType !== "credit_card")?.id ??
          d.accounts[0]?.id ??
          "";
        setAccountId(preferred);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setStatus("err");
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [categories.length]);

  async function submit() {
    if (!amount || !categoryId || !accountId) return;
    setStatus("saving");
    setError(null);
    try {
      await lifeFetch("/api/life/transactions", {
        method: "POST",
        body: JSON.stringify({
          kind: "expense",
          amountYuan: amount,
          categoryId,
          accountId,
        }),
      });
      setLastSavedLabel(amount);
      setAmount("");
      setStatus("ok");
      setLastAccountId(accountId);
      inputRef.current?.focus();
      window.setTimeout(() => setStatus("idle"), 600);
    } catch (e) {
      setStatus("err");
      setError(e instanceof Error ? e.message : "失敗");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="mb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--life-muted)]">
          Baki Life
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">快速記帳</h1>
      </div>

      <label className="text-xs text-[var(--life-muted)]">金額</label>
      <input
        ref={inputRef}
        inputMode="decimal"
        pattern="[0-9]*"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="0"
        className="mt-1 w-full border-0 border-b border-[var(--life-border)] bg-transparent py-3 text-4xl font-semibold tracking-tight outline-none focus:border-[var(--life-accent)]"
      />

      <p className="mt-6 text-xs text-[var(--life-muted)]">分類</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoryId(c.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              categoryId === c.id
                ? "bg-[var(--life-accent)] text-white"
                : "bg-[var(--life-surface)] text-[var(--life-secondary)] ring-1 ring-[var(--life-border)]"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <p className="mt-6 text-xs text-[var(--life-muted)]">帳戶</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAccountId(a.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              accountId === a.id
                ? "bg-[var(--life-text)] text-[var(--life-bg)]"
                : "bg-[var(--life-surface)] text-[var(--life-secondary)] ring-1 ring-[var(--life-border)]"
            }`}
          >
            {a.name}
            {lastAccountId === a.id ? " · 最近" : ""}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-10">
        <LifeButton
          className="w-full py-3.5 text-base"
          onClick={submit}
          disabled={status === "saving" || !amount}
        >
          {status === "saving" ? "記錄中…" : status === "ok" ? "已記錄 ✓" : "完成"}
        </LifeButton>
        {status === "ok" && lastSavedLabel ? (
          <p className="mt-2 text-center text-sm text-[var(--life-positive)]">
            已記一筆 — 可繼續下一筆
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-center text-sm text-[var(--life-negative)]">{error}</p>
        ) : null}
        <a
          href="/life"
          className="mt-4 block text-center text-sm text-[var(--life-muted)]"
        >
          回 Baki Life
        </a>
      </div>
    </div>
  );
}
