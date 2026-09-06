"use client";

import {
  LifeHeader,
  LifeProgress,
  LifeSection,
  LifeStat,
  formatLifeMoney,
} from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Dashboard = {
  monthLabel: string;
  incomeCents: number;
  expenseCents: number;
  deltaCents: number;
  topExpenseCategory: { name: string; amountCents: number } | null;
  netWorthCents: number;
  latestSnapshot: { capturedAt: string; unrecordedExpenseCents: number } | null;
  topGoal: {
    title: string;
    preparedAmountCents: number;
    targetAmountCents: number | null;
    progressPercent: number | null;
  } | null;
};

export function LifeDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    lifeFetch<Dashboard>("/api/life/dashboard")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="px-5 pt-16 text-sm text-[var(--life-negative)]">{error}</div>
    );
  }
  if (!data) {
    return (
      <div className="px-5 pt-16 text-sm text-[var(--life-muted)]">載入中…</div>
    );
  }

  return (
    <div>
      <LifeHeader
        title={data.monthLabel}
        subtitle="本月財務概況"
        right={
          <Link
            href="/life/quick"
            className="rounded-full bg-[var(--life-accent)] px-3.5 py-2 text-xs font-medium text-white"
          >
            快速記帳
          </Link>
        }
      />

      <section className="mx-5 grid grid-cols-3 gap-3 rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-4">
        <LifeStat label="收入" value={formatLifeMoney(data.incomeCents)} tone="positive" />
        <LifeStat label="支出" value={formatLifeMoney(data.expenseCents)} tone="negative" />
        <LifeStat
          label="差額"
          value={formatLifeMoney(data.deltaCents, true)}
          tone={data.deltaCents >= 0 ? "positive" : "negative"}
        />
      </section>

      {data.topGoal ? (
        <LifeSection title="人生目標">
          <div className="rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">{data.topGoal.title}</p>
              {data.topGoal.progressPercent != null ? (
                <span className="text-sm text-[var(--life-accent)]">
                  {data.topGoal.progressPercent}%
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[var(--life-secondary)]">
              {formatLifeMoney(data.topGoal.preparedAmountCents)}
              {data.topGoal.targetAmountCents != null
                ? ` / ${formatLifeMoney(data.topGoal.targetAmountCents)}`
                : ""}
            </p>
            {data.topGoal.progressPercent != null ? (
              <div className="mt-3">
                <LifeProgress percent={data.topGoal.progressPercent} />
              </div>
            ) : null}
          </div>
        </LifeSection>
      ) : null}

      <LifeSection title="淨資產">
        <div className="rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-4">
          <p className="text-2xl font-semibold tracking-tight">
            {formatLifeMoney(data.netWorthCents)}
          </p>
          {data.latestSnapshot ? (
            <p className="mt-1 text-xs text-[var(--life-muted)]">
              快照{" "}
              {new Date(data.latestSnapshot.capturedAt).toLocaleDateString("zh-TW")}
              {data.latestSnapshot.unrecordedExpenseCents > 0
                ? ` · 未記錄生活費 ${formatLifeMoney(data.latestSnapshot.unrecordedExpenseCents)}`
                : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--life-muted)]">尚未建立財務快照</p>
          )}
        </div>
      </LifeSection>

      {data.topExpenseCategory ? (
        <LifeSection title="最大支出分類">
          <div className="flex items-center justify-between rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-3">
            <span>{data.topExpenseCategory.name}</span>
            <span className="font-medium text-[var(--life-negative)]">
              {formatLifeMoney(data.topExpenseCategory.amountCents)}
            </span>
          </div>
        </LifeSection>
      ) : null}
    </div>
  );
}
