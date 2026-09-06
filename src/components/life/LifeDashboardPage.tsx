"use client";

import { useLifeData } from "@/components/life/LifeDataProvider";
import { useLifePanelActive } from "@/components/life/LifePanelActivity";

import {
  LifeHeader,
  LifeProgress,
  LifeSection,
  LifeStat,
  formatLifeMoney,
  LifeShellSkeleton,
} from "@/components/life/LifeUi";
import { lifeFetch } from "@/lib/life/client";
import Link from "next/link";
import { useOptionalLifeTab } from "@/components/life/LifeTabContext";
import { useEffect, useState } from "react";

type DashboardGoal = {
  id: string;
  title: string;
  icon: string | null;
  status: string;
  preparedAmountCents: number;
  targetAmountCents: number | null;
  progressPercent: number | null;
};

type Dashboard = {
  monthLabel: string;
  incomeCents: number;
  expenseCents: number;
  deltaCents: number;
  topExpenseCategory: { name: string; amountCents: number } | null;
  netWorthCents: number;
  latestSnapshot: { capturedAt: string; unrecordedExpenseCents: number } | null;
  goals?: DashboardGoal[];
  /** Legacy single-goal field; prefer `goals`. */
  topGoal: DashboardGoal | null;
};

export function LifeDashboardPage() {
  const { mutationEpoch } = useLifeData();
  const panelActive = useLifePanelActive("home");
  const lifeTab = useOptionalLifeTab();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!panelActive) return;
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
  }, [mutationEpoch, panelActive]);

  if (error) {
    return (
      <div className="px-5 pt-16 text-sm text-[var(--life-negative)]">{error}</div>
    );
  }
  if (!data) {
    return <LifeShellSkeleton title="首頁" />;
  }

  return (
    <div>
      <LifeHeader
        title={data.monthLabel}
        subtitle="本月財務概況"
        right={
          lifeTab ? (
            <button
              type="button"
              onClick={() => lifeTab.selectTab("quick")}
              className="rounded-full bg-[var(--brand-cta)] px-3.5 py-2 text-xs font-medium text-white"
            >
              快速記帳
            </button>
          ) : (
            <Link
              href="/life/quick"
              className="rounded-full bg-[var(--brand-cta)] px-3.5 py-2 text-xs font-medium text-white"
            >
              快速記帳
            </Link>
          )
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

      {(() => {
        const goals =
          data.goals && data.goals.length > 0
            ? data.goals
            : data.topGoal
              ? [data.topGoal]
              : [];
        if (goals.length === 0) return null;
        return (
          <LifeSection title="人生目標">
            <ul className="space-y-3">
              {goals.map((goal, index) => {
                const muted = goal.status === "paused";
                return (
                  <li
                    key={goal.id ?? `goal-${index}`}
                    className={`rounded-2xl border border-[var(--life-border)] bg-[var(--life-surface)] px-4 py-4 ${
                      muted ? "opacity-70" : ""
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium">
                        {goal.icon ? `${goal.icon} ` : ""}
                        {goal.title}
                      </p>
                      {goal.progressPercent != null ? (
                        <span className="text-sm text-[var(--life-accent)]">
                          {goal.progressPercent}%
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-[var(--life-secondary)]">
                      {formatLifeMoney(goal.preparedAmountCents)}
                      {goal.targetAmountCents != null
                        ? ` / ${formatLifeMoney(goal.targetAmountCents)}`
                        : ""}
                    </p>
                    {goal.progressPercent != null ? (
                      <div className="mt-3">
                        <LifeProgress percent={goal.progressPercent} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </LifeSection>
        );
      })()}

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
