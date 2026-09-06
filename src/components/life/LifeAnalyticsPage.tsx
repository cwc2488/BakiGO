"use client";

import { useLifeData } from "@/components/life/LifeDataProvider";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  LifeHeader,
  LifeSection,
  LifeStat,
  formatLifeMoney,
  LifeShellSkeleton,
} from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import { useEffect, useState } from "react";

type Analytics = {
  income: {
    totalCents: number;
    byCategory: Array<{ name: string; amountCents: number }>;
    largest: { amountCents: number; note: string | null; categoryId: string | null } | null;
  };
  expense: {
    totalCents: number;
    byCategory: Array<{ name: string; amountCents: number }>;
    largest: { amountCents: number; note: string | null; categoryId: string | null } | null;
    unrecordedExpenseCents: number;
    recordedVsUnrecorded: {
      recordedCents: number;
      unrecordedCents: number;
      unrecordedRatio: number;
    };
  };
  monthlyTrend: Array<{ month: string; incomeCents: number; expenseCents: number }>;
};

type Period = "this_month" | "last_month" | "this_year";

export function LifeAnalyticsPage() {
  const { mutationEpoch } = useLifeData();
  const [period, setPeriod] = useState<Period>("this_month");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Keep previous data visible (SWR) — do not blank the panel on tab/period refresh.
    lifeFetch<Analytics>(`/api/life/analytics?period=${period}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [period, mutationEpoch]);

  return (
    <div>
      <LifeHeader title="統計" subtitle="收入與支出分開看" />
      <div className="mx-5 flex gap-1 rounded-xl bg-[var(--life-border)]/60 p-1">
        {(
          [
            ["this_month", "本月"],
            ["last_month", "上月"],
            ["this_year", "今年"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={`flex-1 rounded-lg py-2 text-sm ${
              period === key
                ? "bg-[var(--life-surface)] font-medium"
                : "text-[var(--life-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="px-5 pt-4 text-sm text-[var(--life-negative)]">{error}</p> : null}
      {!data && !error ? (
        <LifeShellSkeleton title="載入中" />
      ) : null}

      {data ? (
        <>
          <LifeSection title="收入">
            <div className="rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-4">
              <LifeStat
                label="總收入"
                value={formatLifeMoney(data.income.totalCents)}
                tone="positive"
              />
              {data.income.largest ? (
                <p className="mt-2 text-xs text-[var(--life-muted)]">
                  最大單筆 {formatLifeMoney(data.income.largest.amountCents)}
                </p>
              ) : null}
              <ul className="mt-4 space-y-2">
                {data.income.byCategory.map((c) => (
                  <li key={c.name} className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="font-medium">{formatLifeMoney(c.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </LifeSection>

          <LifeSection title="支出">
            <div className="rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-4">
              <LifeStat
                label="已記錄支出"
                value={formatLifeMoney(data.expense.totalCents)}
                tone="negative"
              />
              {data.expense.largest ? (
                <p className="mt-2 text-xs text-[var(--life-muted)]">
                  最大單筆 {formatLifeMoney(data.expense.largest.amountCents)}
                </p>
              ) : null}
              <ul className="mt-4 space-y-2">
                {data.expense.byCategory.map((c) => (
                  <li key={c.name} className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="font-medium text-[var(--life-negative)]">
                      {formatLifeMoney(c.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
              {data.expense.unrecordedExpenseCents > 0 ? (
                <div className="mt-4 border-t border-[var(--life-border)] pt-3">
                  <p className="text-sm">
                    未記錄生活費{" "}
                    <span className="font-medium">
                      {formatLifeMoney(data.expense.unrecordedExpenseCents)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--life-muted)]">
                    已記錄 vs 未記錄：
                    {Math.round(
                      (1 - data.expense.recordedVsUnrecorded.unrecordedRatio) * 100,
                    )}
                    % / {Math.round(data.expense.recordedVsUnrecorded.unrecordedRatio * 100)}%
                  </p>
                </div>
              ) : null}
            </div>
          </LifeSection>

          <LifeSection title="月份趨勢">
            <ul className="rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] divide-y divide-[var(--life-border)]">
              {data.monthlyTrend
                .filter((m) => m.incomeCents > 0 || m.expenseCents > 0)
                .map((m) => (
                  <li key={m.month} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-[var(--life-secondary)]">{m.month}</span>
                    <span>
                      <span className="text-[var(--life-positive)]">
                        {formatLifeMoney(m.incomeCents)}
                      </span>
                      <span className="mx-1 text-[var(--life-muted)]">/</span>
                      <span className="text-[var(--life-negative)]">
                        {formatLifeMoney(m.expenseCents)}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </LifeSection>
        </>
      ) : null}
    </div>
  );
}
