"use client";

import { buildRetailHouseSnapshot, PRESENTATION_QUADRANT_LAYOUT } from "@/lib/retail-house/retail-house-selectors";
import {
  formatReportAmount,
  formatReportDateRange,
  formatReportYearMonth,
  formatTransactionDate,
} from "@/lib/retail-house/format-report";
import {
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { APP_EMOJI, QUADRANT_EMOJIS } from "@/lib/ui/app-emojis";
import type { RetailHouseQuadrantView } from "@/types/retail-house";
import type { RetailReportLineItem } from "@/types/retail-weekly-report";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RetailTransactionForm } from "./RetailTransactionForm";

function TransactionRow({
  item,
  unit,
  presentationMode,
}: {
  item: RetailReportLineItem;
  unit: "NTD" | "VP";
  presentationMode: boolean;
}) {
  return (
    <li
      className={
        presentationMode
          ? "rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3"
          : "rounded-2xl bg-[var(--brand-bg)] px-4 py-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={
            presentationMode
              ? "text-[1.125rem] font-semibold text-[#1d1d1f]"
              : "text-[1rem] font-semibold text-[#1d1d1f]"
          }
        >
          {item.customerName}
        </p>
        <span
          className={
            presentationMode
              ? "shrink-0 text-[1.0625rem] font-semibold text-[#1d1d1f]"
              : "shrink-0 text-[0.9375rem] font-semibold text-[#1d1d1f]"
          }
        >
          {formatReportAmount(item.amount, unit)}
        </span>
      </div>
      <p
        className={
          presentationMode
            ? "mt-1.5 text-[0.875rem] text-[#86868b]"
            : "mt-1 text-[0.8125rem] text-[#86868b]"
        }
      >
        {formatTransactionDate(item.transactionDate)}
      </p>
      {item.note ? (
        <p
          className={
            presentationMode
              ? "mt-1.5 text-[0.8125rem] leading-relaxed text-[#636366]"
              : "mt-1 text-[0.8125rem] leading-relaxed text-[#636366]"
          }
        >
          {item.note}
        </p>
      ) : null}
    </li>
  );
}

function QuadrantPanel({
  quadrant,
  presentationMode,
  usePresentationTitle = false,
}: {
  quadrant: RetailHouseQuadrantView;
  presentationMode: boolean;
  usePresentationTitle?: boolean;
}) {
  const heading = usePresentationTitle ? quadrant.presentationTitle : quadrant.title;
  const emoji = QUADRANT_EMOJIS[quadrant.key] ?? APP_EMOJI.page.retailHouse;

  return (
    <section
      className={`flex h-full min-h-0 flex-col rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 shadow-[0_8px_32px_rgba(0,0,0,0.04)] ${
        presentationMode ? "p-4 lg:p-5" : "p-5"
      }`}
    >
      <header className="shrink-0 space-y-1">
        <h2
          className={
            presentationMode
              ? "text-[1.375rem] font-semibold text-[#1d1d1f] lg:text-[1.5rem]"
              : "text-[1.125rem] font-semibold text-[#1d1d1f]"
          }
        >
          {emoji} {heading}
        </h2>
        <p className="text-[0.8125rem] text-[#86868b]">（{quadrant.valueLabel}）</p>
      </header>

      <ul className={`mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto ${presentationMode ? "pr-1" : ""}`}>
        {quadrant.weeklyItems.length > 0 ? (
          quadrant.weeklyItems.map((item) => (
            <TransactionRow
              key={item.transactionId}
              item={item}
              presentationMode={presentationMode}
              unit={quadrant.unit}
            />
          ))
        ) : (
          <li className="py-6 text-center text-[0.9375rem] text-[#86868b]">
            {APP_EMOJI.mood.empty} 本週尚無紀錄
          </li>
        )}
      </ul>
    </section>
  );
}

function FourQuadrantPresentation({
  quadrants,
  weekStartDate,
  weekEndDate,
  displayName,
  avatarUrl,
  onExit,
}: {
  quadrants: RetailHouseQuadrantView[];
  weekStartDate: string;
  weekEndDate: string;
  displayName: string;
  avatarUrl: string | null;
  onExit: () => void;
}) {
  const quadrantByKey = useMemo(
    () => new Map(quadrants.map((quadrant) => [quadrant.key, quadrant])),
    [quadrants],
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[linear-gradient(180deg,#f0faf3_0%,#f5faf6_48%,#e8f8ee_100%)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--brand-border)] bg-[var(--brand-surface)]/90 px-5 py-4 backdrop-blur-md">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium text-[#86868b]">
            {APP_EMOJI.action.presentation} 零售屋簡報
          </p>
          <MemberNameWithAvatar
            avatarUrl={avatarUrl}
            name={displayName}
            nameClassName="truncate text-[1.0625rem] font-semibold text-[#1d1d1f]"
            size="sm"
            subtitle={`本週 ${formatReportDateRange(weekStartDate, weekEndDate)}`}
            subtitleClassName="text-[0.8125rem] text-[#86868b]"
            variant="hero"
          />
        </div>
        <button
          className="shrink-0 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-[0.875rem] font-semibold text-white"
          onClick={onExit}
          type="button"
        >
          結束簡報
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3 p-3 lg:gap-4 lg:p-4">
        {PRESENTATION_QUADRANT_LAYOUT.map((key) => {
          const quadrant = quadrantByKey.get(key);
          if (!quadrant) {
            return null;
          }

          return (
            <QuadrantPanel
              key={key}
              presentationMode
              quadrant={quadrant}
              usePresentationTitle
            />
          );
        })}
      </div>
    </div>
  );
}

function MonthlyTotalsSection({
  quadrants,
  yearMonth,
}: {
  quadrants: RetailHouseQuadrantView[];
  yearMonth: string;
}) {
  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
      <header className="space-y-1">
        <h2 className="text-[1.25rem] font-semibold text-[#1d1d1f]">
          {APP_EMOJI.section.activity} 本月累積
        </h2>
        <p className="text-[0.8125rem] text-[#86868b]">{formatReportYearMonth(yearMonth)}</p>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {quadrants.map((quadrant) => (
          <div key={`monthly-${quadrant.key}`} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
            <p className="text-[0.8125rem] text-[#86868b]">
              {QUADRANT_EMOJIS[quadrant.key] ?? ""} {quadrant.monthlyLabel}：
            </p>
            <p className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">
              {quadrant.monthlyTotal === null
                ? "—"
                : formatReportAmount(quadrant.monthlyTotal, quadrant.unit)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RetailHouseView({
  metrics,
  presentationMode,
  onEnterPresentationMode,
  onExitPresentationMode,
  onMetricsChange,
}: {
  metrics: MemberComputedMetrics;
  presentationMode: boolean;
  onEnterPresentationMode: () => void;
  onExitPresentationMode: () => void;
  onMetricsChange: (metrics: MemberComputedMetrics) => void;
}) {
  const snapshot = useMemo(() => buildRetailHouseSnapshot(metrics), [metrics]);
  const displayName = getMemberDisplayName();
  const avatarUrl = getMemberAvatarUrl();
  const orderedQuadrants = useMemo(
    () =>
      PRESENTATION_QUADRANT_LAYOUT.map((key) =>
        snapshot.quadrants.find((quadrant) => quadrant.key === key),
      ).filter((quadrant): quadrant is RetailHouseQuadrantView => Boolean(quadrant)),
    [snapshot.quadrants],
  );

  useEffect(() => {
    if (!presentationMode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onExitPresentationMode();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presentationMode, onExitPresentationMode]);

  if (presentationMode) {
    return (
      <FourQuadrantPresentation
        avatarUrl={avatarUrl}
        displayName={displayName}
        onExit={onExitPresentationMode}
        quadrants={snapshot.quadrants}
        weekEndDate={snapshot.weekEndDate}
        weekStartDate={snapshot.weekStartDate}
      />
    );
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f0faf3_0%,#f5faf6_48%,#e8f8ee_100%)]">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 pb-24 pt-12">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Link className="text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]" href="/events">
            活動與會議紀錄
          </Link>
        </div>

        <header className="space-y-2">
          <p className="text-[0.8125rem] font-medium tracking-wide text-[#aeaeb2]">Baki GO</p>
          <h1 className="text-[2rem] font-semibold tracking-tight text-[#1d1d1f]">
            {APP_EMOJI.page.retailHouse} 零售屋
          </h1>
          <MemberNameWithAvatar
            avatarUrl={avatarUrl}
            name={`${displayName} 的工作現場`}
            nameClassName="text-[1.125rem] font-semibold text-[#1d1d1f]"
            size="md"
            subtitle={`本週 ${formatReportDateRange(snapshot.weekStartDate, snapshot.weekEndDate)}`}
            subtitleClassName="text-[0.9375rem] text-[#86868b]"
            variant="hero"
          />
        </header>

        <RetailTransactionForm onMetricsChange={onMetricsChange} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:grid-rows-2 lg:gap-5">
          {orderedQuadrants.map((quadrant) => (
            <QuadrantPanel key={quadrant.key} presentationMode={false} quadrant={quadrant} />
          ))}
        </div>

        <MonthlyTotalsSection quadrants={orderedQuadrants} yearMonth={snapshot.yearMonth} />

        <button
          className="w-full rounded-[1.75rem] bg-[#1d1d1f] px-6 py-5 text-[1.0625rem] font-semibold text-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-transform duration-200 active:scale-[0.98]"
          onClick={onEnterPresentationMode}
          type="button"
        >
          {APP_EMOJI.action.presentation} 簡報模式
        </button>
      </main>
    </div>
  );
}

export default function RetailHousePage() {
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setMetrics(loadMissionControlMetrics());
    });
  }, []);

  if (!metrics) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] text-[#86868b]">
        {APP_EMOJI.mood.loading} 載入零售屋…
      </div>
    );
  }

  return (
    <RetailHouseView
      metrics={metrics}
      onEnterPresentationMode={() => setPresentationMode(true)}
      onExitPresentationMode={() => setPresentationMode(false)}
      onMetricsChange={setMetrics}
      presentationMode={presentationMode}
    />
  );
}
