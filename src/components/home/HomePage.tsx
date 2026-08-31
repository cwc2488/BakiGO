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
import { EmptyState, HomeErrorState, HomeLoadingSkeleton } from "@/components/home/states";
import { Card, ProgressBar, SectionLabel } from "@/components/home/ui";
import { GreetingHeader } from "@/components/ui/GreetingHeader";
import { ROUTE_ICON_COMPONENTS, type QuickLinkHref } from "@/components/ui/BrandIcons";
import { TabRootShell } from "@/components/ui/TabRootShell";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  buildDailyActionSnapshot,
} from "@/lib/daily-action/daily-action-selectors";
import {
  buildHomeProgressView,
  buildHomeTodayPriorities,
  MY_HOME_BUSINESS_ENTRIES,
  MY_HOME_MORE_ENTRIES,
  type HomeTodayPriorityCard,
} from "@/lib/home/my-home-presentation";
import { homeMoreEntriesForViewer } from "@/lib/auth/admin-access";
import { useSuperAdmin } from "@/lib/auth/use-super-admin";
import { APP_ICON } from "@/lib/ui/app-icons";

type LoadState = "loading" | "ready" | "error";

function TodayPriorityRow({ card }: { card: HomeTodayPriorityCard }) {
  const body = (
    <div className="flex min-w-0 items-start gap-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1d1d1f] text-[0.875rem] font-bold text-white"
        aria-hidden
      >
        {card.index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="min-w-0 text-[1.0625rem] font-semibold leading-snug break-words text-[#1d1d1f] [overflow-wrap:anywhere]">
          {card.title}
        </p>
        {card.description && card.description !== card.title ? (
          <p className="mt-1 min-w-0 text-[0.875rem] leading-relaxed break-words text-[#86868b] [overflow-wrap:anywhere]">
            {card.description}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (card.href) {
    return (
      <Link
        href={card.href}
        className="block min-w-0 rounded-2xl bg-[var(--brand-bg)] px-4 py-4"
      >
        {body}
      </Link>
    );
  }

  return <article className="min-w-0 rounded-2xl bg-[var(--brand-bg)] px-4 py-4">{body}</article>;
}

function BusinessHomeView({ metrics }: { metrics: MemberComputedMetrics }) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const displayName = getMemberDisplayName();
  const avatarUrl = getMemberAvatarUrl();
  const referenceDate = metrics.missions.referenceDate;
  const todayCards = useMemo(
    () => buildHomeTodayPriorities(metrics.presidentAI.topPriorities),
    [metrics.presidentAI.topPriorities],
  );
  const daily = useMemo(() => buildDailyActionSnapshot(metrics, storage), [metrics, storage]);
  const progress = useMemo(() => buildHomeProgressView(metrics, daily), [metrics, daily]);
  const { isAdmin } = useSuperAdmin();
  const moreEntries = homeMoreEntriesForViewer(MY_HOME_MORE_ENTRIES, isAdmin === true);
  const [moreOpen, setMoreOpen] = useState(false);

  const partnerHint =
    metrics.downlinePartnerSuggestions.length > 0
      ? `有 ${metrics.downlinePartnerSuggestions.length} 位夥伴值得關注`
      : null;

  return (
    <>
      <GreetingHeader
        avatarUrl={avatarUrl}
        displayName={`${formatPlainTimeGreeting()}，${displayName}`}
        subtitle={formatDisplayDate(referenceDate)}
      />

      {/* Layer 1 — 今天 */}
      <Card>
        <SectionLabel icon={APP_ICON.section.presidentAi}>今天</SectionLabel>
        <p className="mt-1 text-[0.9375rem] text-[#86868b]">先完成這 1–3 件</p>
        <div className="mt-4 space-y-3">
          {todayCards.length > 0 ? (
            todayCards.map((card) => <TodayPriorityRow key={card.index} card={card} />)
          ) : (
            <EmptyState
              icon={APP_ICON.mood.done}
              title="今天目前沒有特別需要處理的任務"
              description="可以查看今日行動，安排接下來要完成的事情。"
            />
          )}
        </div>
        <Link
          href="/daily-action"
          className="mt-5 flex min-h-11 w-full items-center justify-center rounded-full bg-[#1d1d1f] px-5 text-[0.9375rem] font-semibold text-white"
        >
          {todayCards.length > 0 ? "開始今天" : "查看今日行動"}
        </Link>
      </Card>

      {/* Layer 2 — 我的進度 */}
      <Card>
        <SectionLabel icon={APP_ICON.page.profile}>我的進度</SectionLabel>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-[0.8125rem] font-medium text-[#86868b]">{progress.nextGoalLabel}</p>
            <p className="mt-1 text-[1.0625rem] font-semibold break-words text-[#1d1d1f] [overflow-wrap:anywhere]">
              {progress.nextGoalValue ?? "—"}
            </p>
            {progress.nextGoalPercent != null ? (
              <div className="mt-2">
                <ProgressBar color="#77b539" percent={progress.nextGoalPercent} />
              </div>
            ) : null}
          </div>

          <dl className="space-y-3">
            {progress.rows.map((row) => (
              <div key={row.label}>
                <div className="flex min-w-0 items-baseline justify-between gap-3">
                  <dt className="text-[0.9375rem] text-[#636366]">{row.label}</dt>
                  <dd className="min-w-0 text-right text-[0.9375rem] font-medium break-words text-[#1d1d1f] [overflow-wrap:anywhere]">
                    {row.value}
                  </dd>
                </div>
                {row.percent != null ? (
                  <div className="mt-1.5">
                    <ProgressBar color="#77b539" percent={row.percent} />
                  </div>
                ) : null}
              </div>
            ))}
          </dl>
        </div>
        <Link
          href={progress.fullProgressHref}
          className="mt-5 inline-flex min-h-11 items-center text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]"
        >
          查看完整進度 →
        </Link>
      </Card>

      {/* Layer 3 — 我的事業 */}
      <section className="home-section space-y-3">
        <SectionLabel>我的事業</SectionLabel>
        {partnerHint ? (
          <Link
            href="/organization"
            className="block min-h-11 rounded-2xl bg-[#f7faf5] px-4 py-3 text-[0.875rem] font-medium text-[#3f6212] break-words"
          >
            我的組織 · {partnerHint}
          </Link>
        ) : null}
        <div className="grid grid-cols-1 gap-2.5">
          {MY_HOME_BUSINESS_ENTRIES.map((entry) => {
            const Icon =
              ROUTE_ICON_COMPONENTS[entry.href as QuickLinkHref] ??
              ROUTE_ICON_COMPONENTS["/goals"];
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className="flex min-h-14 min-w-0 items-center gap-4 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5"
              >
                <Icon className="shrink-0 text-[var(--brand-primary)]" size={28} />
                <span className="text-[1rem] font-semibold text-[#1d1d1f]">{entry.title}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Layer 4 — 更多 */}
      <section className="home-section space-y-2 pb-4">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 text-left text-[0.9375rem] font-semibold text-[#1d1d1f]"
          onClick={() => setMoreOpen((value) => !value)}
        >
          <span>更多</span>
          <span aria-hidden>{moreOpen ? "▴" : "▾"}</span>
        </button>
        {moreOpen ? (
          <div className="space-y-1.5 rounded-2xl bg-[var(--brand-bg)] px-2 py-2">
            {moreEntries.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className="flex min-h-11 items-center rounded-xl px-3 text-[0.9375rem] font-medium text-[#1d1d1f]"
              >
                {entry.title}
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-1 text-[0.8125rem] text-[#86868b]">
            個人資料、促銷、活動紀錄、會前會圖…
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
      // Home path: skip MapUniverse presentation build (not rendered).
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
    try {
      const cached = readMissionControlMetrics();
      if (cached) {
        setMetrics(cached);
        setLoadState("ready");
        queueMicrotask(() => softRecalc());
        return;
      }
      setLoadState("loading");
      softRecalc();
    } catch {
      setLoadState("error");
      setErrorMessage("系統無法完成計算，請重新載入或稍後再試。");
    }
  }, [softRecalc]);

  useEffect(() => {
    queueMicrotask(() => {
      bootstrap();
    });
  }, [bootstrap]);

  if (loadState === "loading" && !metrics) {
    return <HomeLoadingSkeleton />;
  }

  if (loadState === "error" && !metrics) {
    return <HomeErrorState message={errorMessage} onRetry={bootstrap} />;
  }

  if (!metrics) {
    return <HomeErrorState message={errorMessage} onRetry={bootstrap} />;
  }

  return (
    <TabRootShell decorated>
      <BusinessHomeView metrics={metrics} />
    </TabRootShell>
  );
}
