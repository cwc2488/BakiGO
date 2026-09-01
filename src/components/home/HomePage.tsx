"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatDisplayDate,
  formatPlainTimeGreeting,
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
  readMissionControlMetrics,
} from "@/lib/mission-control/format";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { HomeErrorState, HomeLoadingSkeleton } from "@/components/home/states";
import { ProgressBar } from "@/components/home/ui";
import { GreetingHeader } from "@/components/ui/GreetingHeader";
import { ROUTE_ICON_COMPONENTS, type QuickLinkHref } from "@/components/ui/BrandIcons";
import { TabRootShell } from "@/components/ui/TabRootShell";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { buildDailyActionSnapshot } from "@/lib/daily-action/daily-action-selectors";
import {
  buildHomeProgressView,
  MY_HOME_BUSINESS_ENTRIES,
  MY_HOME_MORE_ENTRIES,
} from "@/lib/home/my-home-presentation";
import { homeMoreEntriesForViewer } from "@/lib/auth/admin-access";
import { useSuperAdmin } from "@/lib/auth/use-super-admin";
import { useSoftRefresh } from "@/lib/hooks/use-soft-refresh";
import { millisecondsUntilNextAppMidnight } from "@/lib/config/app-config";

type LoadState = "loading" | "ready" | "error";

function MetricRow({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <dt className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">{label}</dt>
        <dd className="min-w-0 text-right text-[1.0625rem] font-semibold tabular-nums tracking-tight text-[var(--brand-text)] [overflow-wrap:anywhere]">
          {value}
        </dd>
      </div>
      {percent != null ? (
        <ProgressBar color="var(--brand-primary)" height="h-1" percent={percent} />
      ) : null}
    </div>
  );
}

function BusinessHomeView({ metrics }: { metrics: MemberComputedMetrics }) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const displayName = getMemberDisplayName();
  const avatarUrl = getMemberAvatarUrl();
  const referenceDate = metrics.missions.referenceDate;
  const daily = useMemo(() => buildDailyActionSnapshot(metrics, storage), [metrics, storage]);
  const progress = useMemo(() => buildHomeProgressView(metrics, daily), [metrics, daily]);
  const { isAdmin } = useSuperAdmin();
  const moreEntries = homeMoreEntriesForViewer(MY_HOME_MORE_ENTRIES, isAdmin === true);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <GreetingHeader
        avatarUrl={avatarUrl}
        displayName={`${formatPlainTimeGreeting()}，${displayName}`}
        subtitle={formatDisplayDate(referenceDate)}
      />

      {/* 我的進度 — monthly metrics only (promotion target hidden) */}
      <section className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5 shadow-[0_1px_2px_rgba(29,29,31,0.04)]">
        <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
          我的進度
        </h2>
        <dl className="mt-5 space-y-5">
          {progress.rows.map((row) => (
            <MetricRow key={row.label} label={row.label} percent={row.percent} value={row.value} />
          ))}
        </dl>
      </section>

      {/* 我的事業 */}
      <section className="space-y-3">
        <h2 className="px-0.5 text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
          我的事業
        </h2>
        <div className="overflow-hidden rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] shadow-[0_1px_2px_rgba(29,29,31,0.04)]">
          {MY_HOME_BUSINESS_ENTRIES.map((entry, index) => {
            const Icon =
              ROUTE_ICON_COMPONENTS[entry.href as QuickLinkHref] ??
              ROUTE_ICON_COMPONENTS["/organization"];
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={`flex min-h-[3.25rem] min-w-0 items-center gap-3.5 px-4 py-3 transition-colors active:bg-[var(--brand-primary-muted)] ${
                  index > 0 ? "border-t border-[var(--brand-border)]/70" : ""
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]">
                  <Icon size={20} />
                </span>
                <span className="flex-1 text-[0.9375rem] font-semibold text-[var(--brand-text)]">
                  {entry.title}
                </span>
                <span aria-hidden className="text-[0.875rem] text-[var(--brand-hint)]">
                  ›
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 更多 */}
      <section className="space-y-2 pb-2">
        <button
          type="button"
          aria-expanded={moreOpen}
          className="flex min-h-11 w-full items-center justify-between rounded-[1rem] px-1 text-left text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]"
          onClick={() => setMoreOpen((value) => !value)}
        >
          <span>更多</span>
          <span aria-hidden className="text-[0.75rem]">
            {moreOpen ? "▴" : "▾"}
          </span>
        </button>
        {moreOpen ? (
          <div className="overflow-hidden rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] shadow-[0_1px_2px_rgba(29,29,31,0.04)]">
            {moreEntries.map((entry, index) => (
              <Link
                key={entry.href}
                href={entry.href}
                className={`flex min-h-11 items-center px-4 text-[0.9375rem] font-medium text-[var(--brand-text)] transition-colors active:bg-[var(--brand-primary-muted)] ${
                  index > 0 ? "border-t border-[var(--brand-border)]/70" : ""
                }`}
              >
                {entry.title}
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-1 text-[0.75rem] leading-relaxed text-[var(--brand-hint)]">
            促銷、會前會圖、個人設定
            {isAdmin ? "、管理中心" : ""}
          </p>
        )}
      </section>
    </>
  );
}

export default function HomePage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [errorMessage, setErrorMessage] = useState("資料載入失敗，請稍後再試。");

  const softRecalc = useCallback(() => {
    try {
      const snapshot = loadMissionControlMetrics(undefined, createLocalStorageAdapter(), undefined, {
        includeMapUniverse: false,
      });
      setMetrics(snapshot);
      setLoadState("ready");
    } catch {
      setLoadState((prev) => (prev === "ready" ? "ready" : "error"));
      setErrorMessage("系統無法完成計算，請重新載入或稍後再試。");
    }
  }, []);

  const bootstrap = useCallback(() => {
    setErrorMessage("資料載入失敗，請稍後再試。");
    let cached: MemberComputedMetrics | null = null;
    try {
      cached = readMissionControlMetrics();
    } catch {
      cached = null;
    }

    if (cached) {
      setMetrics(cached);
      setLoadState("ready");
      queueMicrotask(() => softRecalc());
      return;
    }

    setLoadState("loading");
    softRecalc();
  }, [softRecalc]);

  useEffect(() => {
    queueMicrotask(() => {
      bootstrap();
    });
  }, [bootstrap]);

  // Resume from background / focus — re-resolve Taipei "today" without restart.
  useSoftRefresh(() => {
    bootstrap();
  });

  // Schedule refresh at the next Asia/Taipei midnight boundary.
  useEffect(() => {
    let timerId: number | null = null;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) {
        return;
      }
      const delay = millisecondsUntilNextAppMidnight();
      timerId = window.setTimeout(() => {
        bootstrap();
        schedule();
      }, delay + 50);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [bootstrap]);

  if (loadState === "loading" && !metrics) {
    return <HomeLoadingSkeleton />;
  }

  if ((loadState === "error" || !metrics) && !metrics) {
    return <HomeErrorState message={errorMessage} onRetry={bootstrap} />;
  }

  if (!metrics) {
    return <HomeErrorState message={errorMessage} onRetry={bootstrap} />;
  }

  return (
    <TabRootShell>
      <BusinessHomeView metrics={metrics} />
    </TabRootShell>
  );
}
