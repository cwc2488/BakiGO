"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  LifeButton,
  LifeHeader,
  LifeInput,
  LifeSection,
  LifeSelect,
  LifeStat,
  formatLifeMoney,
} from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import type { LifeAccount, LifeSnapshot } from "@/types/life";
import { useCallback, useEffect, useMemo, useState } from "react";

const TYPE_LABEL: Record<string, string> = {
  bank: "銀行",
  cash: "現金",
  e_payment: "電子支付",
  credit_card: "信用卡",
  goal_pocket: "目標口袋",
};

export function LifeAssetsPage() {
  const [accounts, setAccounts] = useState<LifeAccount[]>([]);
  const [snapshots, setSnapshots] = useState<LifeSnapshot[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("bank");
  const [ccName, setCcName] = useState("");
  const [ccBalance, setCcBalance] = useState("");
  const [ccPayAccount, setCcPayAccount] = useState("");
  const [payCcId, setPayCcId] = useState("");
  const [payFromId, setPayFromId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [a, s] = await Promise.all([
      lifeFetch<{ accounts: LifeAccount[] }>("/api/life/accounts?includeArchived=1"),
      lifeFetch<{ snapshots: LifeSnapshot[] }>("/api/life/snapshots"),
    ]);
    setAccounts(a.accounts);
    setSnapshots(s.snapshots);
    const next: Record<string, string> = {};
    for (const acct of a.accounts.filter((x) => x.status === "active")) {
      next[acct.id] = String(acct.balanceCents / 100);
    }
    setBalances(next);
  }, []);

  useEffect(() => {
    refresh().catch((e: Error) => setMessage(e.message));
  }, [refresh]);

  const active = useMemo(() => accounts.filter((a) => a.status === "active"), [accounts]);
  const assets = active.filter((a) => a.accountType !== "credit_card");
  const cards = active.filter((a) => a.accountType === "credit_card");
  const banks = active.filter((a) =>
    ["bank", "cash", "e_payment"].includes(a.accountType),
  );

  const assetTotal = assets.reduce((s, a) => s + a.balanceCents, 0);
  const liabTotal = cards.reduce((s, a) => s + a.balanceCents, 0);

  async function addAccount() {
    try {
      await lifeFetch("/api/life/accounts", {
        method: "POST",
        body: JSON.stringify({ name: newName, accountType: newType }),
      });
      setNewName("");
      setMessage("帳戶已新增");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗");
    }
  }

  async function addCreditCard() {
    try {
      await lifeFetch("/api/life/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: ccName,
          accountType: "credit_card",
          balanceYuan: ccBalance || 0,
          defaultPaymentAccountId: ccPayAccount || null,
        }),
      });
      setCcName("");
      setCcBalance("");
      setMessage("信用卡已新增");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗");
    }
  }

  async function payCredit(full: boolean) {
    const cc = cards.find((c) => c.id === payCcId);
    if (!cc) return;
    const amountYuan = full ? String(cc.balanceCents / 100) : payAmount;
    try {
      await lifeFetch("/api/life/transactions", {
        method: "POST",
        body: JSON.stringify({
          kind: "credit_payment",
          amountYuan,
          accountId: payFromId || cc.defaultPaymentAccountId,
          counterpartyAccountId: payCcId,
        }),
      });
      setPayAmount("");
      setMessage(full ? "已繳清" : "已部分繳款");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗");
    }
  }

  async function saveSnapshot() {
    try {
      const payload = {
        balances: active.map((a) => ({
          accountId: a.id,
          balanceYuan: balances[a.id] ?? "0",
        })),
      };
      const res = await lifeFetch<{ snapshot: LifeSnapshot }>("/api/life/snapshots", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage(
        res.snapshot.unrecordedExpenseCents > 0
          ? `快照已存 · 未記錄生活費 ${formatLifeMoney(res.snapshot.unrecordedExpenseCents)}`
          : "快照已存",
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗");
    }
  }

  async function archiveAccount(id: string) {
    try {
      await lifeFetch("/api/life/accounts", {
        method: "PATCH",
        body: JSON.stringify({ id, status: "archived" }),
      });
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗");
    }
  }

  return (
    <div>
      <LifeHeader title="資產" subtitle="帳戶、信用卡與財務快照" />
      {message ? (
        <p className="px-5 text-sm text-[var(--life-accent)]">{message}</p>
      ) : null}

      <section className="mx-5 grid grid-cols-3 gap-3 rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-4">
        <LifeStat label="總資產" value={formatLifeMoney(assetTotal)} />
        <LifeStat label="總負債" value={formatLifeMoney(liabTotal)} tone="negative" />
        <LifeStat label="淨資產" value={formatLifeMoney(assetTotal - liabTotal)} tone="positive" />
      </section>

      <LifeSection title="帳戶">
        <ul className="divide-y divide-[var(--life-border)] rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)]">
          {assets.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{a.name}</p>
                <p className="text-[11px] text-[var(--life-muted)]">
                  {TYPE_LABEL[a.accountType] ?? a.accountType}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{formatLifeMoney(a.balanceCents)}</span>
                <button
                  type="button"
                  className="text-[11px] text-[var(--life-muted)]"
                  onClick={() => archiveAccount(a.id)}
                >
                  封存
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-2">
          <LifeInput
            placeholder="新帳戶名稱"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <LifeSelect value={newType} onChange={(e) => setNewType(e.target.value)}>
            <option value="bank">銀行</option>
            <option value="cash">現金</option>
            <option value="e_payment">電子支付</option>
          </LifeSelect>
          <LifeButton className="w-full" onClick={addAccount}>
            新增帳戶
          </LifeButton>
        </div>
      </LifeSection>

      <LifeSection title="信用卡">
        {cards.length === 0 ? (
          <p className="mb-3 text-sm text-[var(--life-muted)]">目前無信用卡（可預先新增）</p>
        ) : (
          <ul className="mb-3 space-y-2">
            {cards.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-3"
              >
                <div className="flex justify-between">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[var(--life-negative)]">
                    待繳 {formatLifeMoney(c.balanceCents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <LifeInput
            placeholder="信用卡名稱"
            value={ccName}
            onChange={(e) => setCcName(e.target.value)}
          />
          <LifeInput
            inputMode="decimal"
            placeholder="目前待繳餘額"
            value={ccBalance}
            onChange={(e) => setCcBalance(e.target.value)}
          />
          <LifeSelect value={ccPayAccount} onChange={(e) => setCcPayAccount(e.target.value)}>
            <option value="">預設繳款帳戶（選填）</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </LifeSelect>
          <LifeButton className="w-full" onClick={addCreditCard}>
            新增信用卡
          </LifeButton>
        </div>

        {cards.length > 0 ? (
          <div className="mt-4 space-y-2 border-t border-[var(--life-border)] pt-4">
            <p className="text-sm text-[var(--life-secondary)]">繳款（不新增支出）</p>
            <LifeSelect value={payCcId} onChange={(e) => setPayCcId(e.target.value)}>
              <option value="">選擇信用卡</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </LifeSelect>
            <LifeSelect value={payFromId} onChange={(e) => setPayFromId(e.target.value)}>
              <option value="">扣款帳戶</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </LifeSelect>
            <LifeInput
              inputMode="decimal"
              placeholder="部分繳款金額"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
            <div className="flex gap-2">
              <LifeButton className="flex-1" onClick={() => payCredit(true)}>
                繳清
              </LifeButton>
              <LifeButton variant="ghost" className="flex-1" onClick={() => payCredit(false)}>
                部分繳款
              </LifeButton>
            </div>
          </div>
        ) : null}
      </LifeSection>

      <LifeSection title="財務快照">
        <p className="mb-3 text-xs text-[var(--life-muted)]">
          輸入各帳戶當下實際餘額。系統會計算淨資產，並與上次快照比較得出「未記錄生活費」。
        </p>
        <ul className="space-y-2">
          {active.map((a) => (
            <li key={a.id} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm">{a.name}</span>
              <LifeInput
                inputMode="decimal"
                value={balances[a.id] ?? ""}
                onChange={(e) =>
                  setBalances((prev) => ({ ...prev, [a.id]: e.target.value }))
                }
              />
            </li>
          ))}
        </ul>
        <LifeButton className="mt-3 w-full" onClick={saveSnapshot}>
          儲存快照
        </LifeButton>
        {snapshots[0] ? (
          <div className="mt-4 rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-3 text-sm">
            <p>
              最近快照{" "}
              {new Date(snapshots[0].capturedAt).toLocaleString("zh-TW")}
            </p>
            <p className="mt-1">淨資產 {formatLifeMoney(snapshots[0].netWorthCents)}</p>
            {snapshots[0].unrecordedExpenseCents > 0 ? (
              <p className="mt-1 text-[var(--life-negative)]">
                未記錄生活費 {formatLifeMoney(snapshots[0].unrecordedExpenseCents)}
              </p>
            ) : null}
          </div>
        ) : null}
      </LifeSection>
    </div>
  );
}
