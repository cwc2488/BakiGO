"use client";

import { useLifeData } from "@/components/life/LifeDataProvider";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  LifeButton,
  LifeHeader,
  LifeInput,
  LifeProgress,
  LifeSection,
  LifeSelect,
  LifeShellSkeleton,
  formatLifeMoney,
} from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import type { LifeAccount, LifeGoal } from "@/types/life";
import { useCallback, useEffect, useState } from "react";

export function LifeGoalsPage() {
  const { mutationEpoch } = useLifeData();
  const [goals, setGoals] = useState<LifeGoal[]>([]);
  const [accounts, setAccounts] = useState<LifeAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [pocketName, setPocketName] = useState("");
  const [parentBankId, setParentBankId] = useState("");
  const [linkGoalId, setLinkGoalId] = useState("");
  const [pocketBalance, setPocketBalance] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [g, a] = await Promise.all([
      lifeFetch<{ goals: LifeGoal[] }>("/api/life/goals"),
      lifeFetch<{ accounts: LifeAccount[] }>("/api/life/accounts"),
    ]);
    setGoals(g.goals);
    setAccounts(a.accounts);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh().catch((e: Error) => {
      setMessage(e.message);
      setLoaded(true);
    });
  }, [refresh, mutationEpoch]);

  if (!loaded) {
    return <LifeShellSkeleton title="目標" />;
  }

  const banks = accounts.filter((a) => a.accountType === "bank" && a.status === "active");
  const pockets = accounts.filter((a) => a.accountType === "goal_pocket");

  async function createGoal() {
    try {
      await lifeFetch("/api/life/goals", {
        method: "POST",
        body: JSON.stringify({
          title,
          icon,
          targetAmountYuan: target || null,
          status: "active",
        }),
      });
      setTitle("");
      setTarget("");
      setMessage("目標已建立");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗");
    }
  }

  async function createPocket() {
    try {
      await lifeFetch("/api/life/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: pocketName,
          accountType: "goal_pocket",
          parentAccountId: parentBankId || null,
          linkedGoalId: linkGoalId || null,
          balanceYuan: pocketBalance || 0,
        }),
      });
      setPocketName("");
      setPocketBalance("");
      setMessage("口袋已建立");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗");
    }
  }

  async function updatePocketBalance(id: string, yuan: string) {
    try {
      await lifeFetch("/api/life/accounts", {
        method: "PATCH",
        body: JSON.stringify({ id, balanceYuan: yuan }),
      });
      setMessage("口袋金額已更新");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗");
    }
  }

  return (
    <div>
      <LifeHeader title="目標" subtitle="人生目標與將來銀行口袋" />
      {message ? (
        <p className="px-5 text-sm text-[var(--life-accent)]">{message}</p>
      ) : null}

      <LifeSection title="我的目標">
        <ul className="space-y-3">
          {goals.length === 0 ? (
            <li className="text-sm text-[var(--life-muted)]">尚未建立目標</li>
          ) : (
            goals.map((g) => {
              const pct =
                g.targetAmountCents && g.targetAmountCents > 0
                  ? Math.min(100, Math.round((g.preparedAmountCents / g.targetAmountCents) * 100))
                  : null;
              return (
                <li
                  key={g.id}
                  className="rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {g.icon ? `${g.icon} ` : ""}
                      {g.title}
                    </p>
                    {pct != null ? (
                      <span className="text-sm text-[var(--life-accent)]">{pct}%</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--life-secondary)]">
                    {formatLifeMoney(g.preparedAmountCents)}
                    {g.targetAmountCents != null
                      ? ` / ${formatLifeMoney(g.targetAmountCents)}`
                      : ""}
                  </p>
                  {pct != null ? (
                    <div className="mt-3">
                      <LifeProgress percent={pct} />
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </LifeSection>

      <LifeSection title="新增目標">
        <div className="space-y-3">
          <LifeInput placeholder="目標名稱" value={title} onChange={(e) => setTitle(e.target.value)} />
          <LifeInput
            placeholder="目標金額（選填）"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <LifeInput placeholder="圖示" value={icon} onChange={(e) => setIcon(e.target.value)} />
          <LifeButton className="w-full" onClick={createGoal}>
            建立目標
          </LifeButton>
        </div>
      </LifeSection>

      <LifeSection title="目標口袋">
        <ul className="mb-4 space-y-3">
          {pockets.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-[var(--life-muted)]">
                    {accounts.find((a) => a.id === p.parentAccountId)?.name ?? "獨立口袋"}
                    {p.linkedGoalId
                      ? ` · ${goals.find((g) => g.id === p.linkedGoalId)?.title ?? ""}`
                      : ""}
                  </p>
                </div>
                <p className="font-medium">{formatLifeMoney(p.balanceCents)}</p>
              </div>
              <div className="mt-2 flex gap-2">
                <LifeInput
                  inputMode="decimal"
                  placeholder="更新金額"
                  defaultValue={String(p.balanceCents / 100)}
                  id={`pocket-${p.id}`}
                />
                <LifeButton
                  variant="ghost"
                  onClick={() => {
                    const el = document.getElementById(`pocket-${p.id}`) as HTMLInputElement | null;
                    if (el) void updatePocketBalance(p.id, el.value);
                  }}
                >
                  更新
                </LifeButton>
              </div>
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          <LifeInput
            placeholder="口袋名稱（例：世界盃口袋）"
            value={pocketName}
            onChange={(e) => setPocketName(e.target.value)}
          />
          <LifeSelect value={parentBankId} onChange={(e) => setParentBankId(e.target.value)}>
            <option value="">掛在銀行（選填）</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </LifeSelect>
          <LifeSelect value={linkGoalId} onChange={(e) => setLinkGoalId(e.target.value)}>
            <option value="">綁定人生目標（選填）</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </LifeSelect>
          <LifeInput
            inputMode="decimal"
            placeholder="目前口袋金額"
            value={pocketBalance}
            onChange={(e) => setPocketBalance(e.target.value)}
          />
          <LifeButton className="w-full" onClick={createPocket}>
            建立口袋
          </LifeButton>
        </div>
      </LifeSection>
    </div>
  );
}
