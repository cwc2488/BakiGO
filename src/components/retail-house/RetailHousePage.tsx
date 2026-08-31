"use client";

import { buildRetailHouseView } from "@/lib/retail-house/build-retail-house-view";
import {
  resolveRetailHouseDateRange,
  type RetailHouseDateRange,
} from "@/lib/retail-house/retail-house-date-range";
import { PRESENTATION_QUADRANT_LAYOUT } from "@/lib/retail-house/retail-house-selectors";
import {
  formatReportAmount,
  formatReportDateRange,
  formatReportPoints,
  formatReportYearMonth,
  formatTransactionDate,
} from "@/lib/retail-house/format-report";
import {
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import { RetailHouseDateRangeSelector } from "@/components/retail-house/RetailHouseDateRangeSelector";
import { RetailTransactionEditSheet } from "@/components/retail-house/RetailTransactionEditSheet";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { todayISODate } from "@/lib/config/app-config";
import { AppIcon, IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON, QUADRANT_ICONS } from "@/lib/ui/app-icons";
import type { RetailHouseQuadrantView } from "@/types/retail-house";
import type { RetailReportLineItem } from "@/types/retail-weekly-report";
import { useEffect, useMemo, useState } from "react";
import { RetailTransactionForm } from "./RetailTransactionForm";
import { PageShell } from "@/components/ui/PageShell";

function TransactionRow({
  item,
  unit,
  showPoints,
  presentationMode,
  onEdit,
}: {
  item: RetailReportLineItem;
  unit: "NTD" | "VP";
  showPoints: boolean;
  presentationMode: boolean;
  onEdit?: (item: RetailReportLineItem) => void;
}) {
  return (
    <li
      className={
        presentationMode
          ? "rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5"
          : "rounded-2xl bg-[var(--brand-bg)] px-4 py-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={
            presentationMode
              ? "text-[0.9375rem] font-semibold leading-snug text-[#1d1d1f]"
              : "text-[1rem] font-semibold text-[#1d1d1f]"
          }
        >
          {item.customerName}
        </p>
        <div className="shrink-0 text-right">
          <span
            className={
              presentationMode
                ? "block text-[0.875rem] font-semibold leading-snug text-[#1d1d1f]"
                : "block text-[0.9375rem] font-semibold text-[#1d1d1f]"
            }
          >
            {formatReportAmount(item.amount, unit)}
          </span>
          {showPoints && item.points !== undefined && item.points > 0 ? (
            <span
              className={
                presentationMode
                  ? "mt-0.5 block text-[0.6875rem] font-medium text-[var(--brand-primary-dark)]"
                  : "mt-0.5 block text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
              }
            >
              {formatReportPoints(item.points)}
            </span>
          ) : null}
        </div>
      </div>
      <div className={`${presentationMode ? "mt-0.5" : "mt-1"} flex items-center justify-between gap-2`}>
        <p
          className={
            presentationMode
              ? "text-[0.75rem] text-[#86868b]"
              : "text-[0.8125rem] text-[#86868b]"
          }
        >
          {formatTransactionDate(item.transactionDate)}
        </p>
        {!presentationMode && onEdit ? (
          <button
            className="rounded-lg px-2 py-1 text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
            onClick={() => onEdit(item)}
            type="button"
          >
            編輯
          </button>
        ) : null}
      </div>
      {item.note ? (
        <p
          className={
            presentationMode
              ? "mt-0.5 text-[0.6875rem] leading-snug text-[#636366]"
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
  onEditItem,
}: {
  quadrant: RetailHouseQuadrantView;
  presentationMode: boolean;
  usePresentationTitle?: boolean;
  onEditItem?: (item: RetailReportLineItem) => void;
}) {
  const heading = usePresentationTitle ? quadrant.presentationTitle : quadrant.title;
  const iconName = QUADRANT_ICONS[quadrant.key] ?? APP_ICON.page.retailHouse;

  return (
    <section
      className={`flex h-full min-h-0 flex-col rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 shadow-[0_8px_32px_rgba(0,0,0,0.04)] ${
        presentationMode ? "p-3 lg:p-3.5" : "p-5"
      }`}
    >
      <header className="shrink-0 space-y-0.5">
        <h2
          className={
            presentationMode
              ? "flex items-center gap-1.5 text-[1.0625rem] font-semibold text-[#1d1d1f] lg:text-[1.125rem]"
              : "flex items-center gap-2 text-[1.125rem] font-semibold text-[#1d1d1f]"
          }
        >
          <AppIcon name={iconName} size={presentationMode ? 18 : 20} />
          {heading}
        </h2>
        <p className={presentationMode ? "text-[0.75rem] text-[#86868b]" : "text-[0.8125rem] text-[#86868b]"}>
          （{quadrant.valueLabel}）
        </p>
      </header>

      <ul
        className={`min-h-0 flex-1 overflow-y-auto ${
          presentationMode ? "mt-2 space-y-1 pr-0.5" : "mt-3 space-y-2"
        }`}
      >
        {quadrant.weeklyItems.length > 0 ? (
          quadrant.weeklyItems.map((item) => (
            <TransactionRow
              key={item.transactionId}
              item={item}
              onEdit={onEditItem}
              presentationMode={presentationMode}
              showPoints={quadrant.showPoints}
              unit={quadrant.unit}
            />
          ))
        ) : (
          <li className="py-6 text-center text-[0.9375rem] text-[#86868b]">
            <IconLabel icon={APP_ICON.mood.empty}>此區間尚無紀錄</IconLabel>
          </li>
        )}
      </ul>
    </section>
  );
}

function FourQuadrantPresentation({
  quadrants,
  rangeLabel,
  displayName,
  avatarUrl,
  onExit,
}: {
  quadrants: RetailHouseQuadrantView[];
  rangeLabel: string;
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
            <IconLabel icon={APP_ICON.action.presentation}>零售屋簡報</IconLabel>
          </p>
          <MemberNameWithAvatar
            avatarUrl={avatarUrl}
            name={displayName}
            nameClassName="truncate text-[1.0625rem] font-semibold text-[#1d1d1f]"
            size="sm"
            subtitle={rangeLabel}
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

function PeriodTotalsSection({
  quadrants,
  dateRange,
  yearMonth,
}: {
  quadrants: RetailHouseQuadrantView[];
  dateRange: RetailHouseDateRange;
  yearMonth: string;
}) {
  const title =
    dateRange.preset === "month"
      ? "本月累積"
      : dateRange.preset === "week"
        ? "本週累積"
        : "區間累積";
  const subtitle =
    dateRange.preset === "month"
      ? formatReportYearMonth(yearMonth)
      : formatReportDateRange(dateRange.startDate, dateRange.endDate);

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
      <header className="space-y-1">
        <h2 className="text-[1.25rem] font-semibold text-[#1d1d1f]">
          <IconLabel icon={APP_ICON.section.activity}>{title}</IconLabel>
        </h2>
        <p className="text-[0.8125rem] text-[#86868b]">{subtitle}</p>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {quadrants.map((quadrant) => (
          <div key={`period-${quadrant.key}`} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[0.8125rem] text-[#86868b]">
              {QUADRANT_ICONS[quadrant.key] ? (
                <AppIcon name={QUADRANT_ICONS[quadrant.key]!} size={14} />
              ) : null}
              {quadrant.monthlyLabel}：
            </p>
            <p className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">
              {formatReportAmount(quadrant.monthlyTotal, quadrant.unit)}
            </p>
            {quadrant.showPoints && quadrant.periodPointsTotal > 0 ? (
              <p className="mt-1 text-[0.9375rem] font-medium text-[var(--brand-primary-dark)]">
                {formatReportPoints(quadrant.periodPointsTotal)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function RetailHouseView({
  metrics,
  dateRange,
  presentationMode,
  editingItem,
  listEpoch,
  onDateRangeChange,
  onEnterPresentationMode,
  onExitPresentationMode,
  onMetricsChange,
  onEditItem,
  onCloseEdit,
}: {
  metrics: MemberComputedMetrics;
  dateRange: RetailHouseDateRange;
  presentationMode: boolean;
  editingItem: RetailReportLineItem | null;
  /** Bumped on create/update/delete so the list rebuilds from repository truth. */
  listEpoch: number;
  onDateRangeChange: (range: RetailHouseDateRange) => void;
  onEnterPresentationMode: () => void;
  onExitPresentationMode: () => void;
  onMetricsChange: (metrics: MemberComputedMetrics) => void;
  onEditItem: (item: RetailReportLineItem) => void;
  onCloseEdit: () => void;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const snapshot = useMemo(
    () => buildRetailHouseView(metrics, dateRange, storage),
    [metrics, dateRange, storage, listEpoch],
  );
  const displayName = getMemberDisplayName();
  const avatarUrl = getMemberAvatarUrl();
  const rangeLabel = formatReportDateRange(snapshot.weekStartDate, snapshot.weekEndDate);
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
        rangeLabel={rangeLabel}
      />
    );
  }

  return (
    <>
      <PageShell
        backHref="/"
        backLabel="返回我的"
        containerClassName="wide-container"
        headerExtra={
          <MemberNameWithAvatar
            avatarUrl={avatarUrl}
            name={`${displayName} 的工作現場`}
            nameClassName="min-w-0 text-[1rem] font-semibold break-words text-[var(--brand-text)] [overflow-wrap:anywhere]"
            size="sm"
            subtitle={rangeLabel}
            subtitleClassName="text-[0.8125rem] text-[var(--brand-text-muted)]"
            variant="hero"
          />
        }
        subtitle="四象限成交、時間區間與簡報模式"
        title="零售屋"
        titleIcon={APP_ICON.page.retailHouse}
      >
        <RetailHouseDateRangeSelector onChange={onDateRangeChange} value={dateRange} />
        <RetailTransactionForm onMetricsChange={onMetricsChange} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:grid-rows-2 lg:gap-5">
          {orderedQuadrants.map((quadrant) => (
            <QuadrantPanel
              key={quadrant.key}
              onEditItem={onEditItem}
              presentationMode={false}
              quadrant={quadrant}
            />
          ))}
        </div>

        <PeriodTotalsSection
          dateRange={dateRange}
          quadrants={orderedQuadrants}
          yearMonth={snapshot.yearMonth}
        />

        <button
          className="w-full rounded-[1.75rem] bg-[#1d1d1f] px-6 py-5 text-[1.0625rem] font-semibold text-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-transform duration-200 active:scale-[0.98]"
          onClick={onEnterPresentationMode}
          type="button"
        >
          <IconLabel icon={APP_ICON.action.presentation}>簡報模式</IconLabel>
        </button>
      </PageShell>

      {editingItem ? (
        <RetailTransactionEditSheet
          item={editingItem}
          onClose={onCloseEdit}
          onMetricsChange={onMetricsChange}
        />
      ) : null}
    </>
  );
}

export default function RetailHousePage() {
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [dateRange, setDateRange] = useState<RetailHouseDateRange>(() =>
    resolveRetailHouseDateRange("week", todayISODate()),
  );
  const [editingItem, setEditingItem] = useState<RetailReportLineItem | null>(null);
  const [listEpoch, setListEpoch] = useState(0);

  useEffect(() => {
    queueMicrotask(() => {
      setMetrics(loadMissionControlMetrics());
    });
  }, []);

  function handleMutationComplete(nextMetrics: MemberComputedMetrics) {
    // Local repository is already updated — refresh presentation immediately,
    // clear any selected edit target, then let cloud sync finish async.
    setMetrics(nextMetrics);
    setEditingItem(null);
    setListEpoch((epoch) => epoch + 1);
  }

  if (!metrics) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] text-[#86868b]">
        <IconLabel icon={APP_ICON.mood.loading}>載入零售屋…</IconLabel>
      </div>
    );
  }

  return (
    <RetailHouseView
      dateRange={dateRange}
      editingItem={editingItem}
      listEpoch={listEpoch}
      metrics={metrics}
      onCloseEdit={() => setEditingItem(null)}
      onDateRangeChange={setDateRange}
      onEditItem={setEditingItem}
      onEnterPresentationMode={() => setPresentationMode(true)}
      onExitPresentationMode={() => setPresentationMode(false)}
      onMetricsChange={handleMutationComplete}
      presentationMode={presentationMode}
    />
  );
}
