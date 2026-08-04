"use client";

import {
  formatLineItem,
  formatReportAmount,
  formatReportDateRange,
  formatReportYearMonth,
} from "@/lib/retail-house/format-report";
import { loadMissionControlMetrics } from "@/lib/mission-control/format";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { RetailReportCategory, RetailReportLineItem } from "@/types/retail-weekly-report";
import Link from "next/link";
import { useEffect, useState } from "react";

function Divider({ shareMode }: { shareMode: boolean }) {
  return (
    <hr
      className={`border-0 border-t border-[#e5e5ea] ${shareMode ? "my-10" : "my-6"}`}
    />
  );
}

function LineItemRow({
  item,
  shareMode,
}: {
  item: RetailReportLineItem;
  shareMode: boolean;
}) {
  return (
    <li className={shareMode ? "space-y-2 py-4" : "space-y-1 py-3"}>
      <p
        className={
          shareMode
            ? "text-[1.75rem] font-semibold leading-tight text-[#1d1d1f]"
            : "text-[1.0625rem] font-semibold text-[#1d1d1f]"
        }
      >
        • {item.customerName}
      </p>
      <p
        className={
          shareMode
            ? "text-[1.375rem] font-medium text-[#636366]"
            : "text-[0.9375rem] font-medium text-[#86868b]"
        }
      >
        {formatLineItem(item)}
      </p>
    </li>
  );
}

function CategorySection({
  category,
  shareMode,
}: {
  category: RetailReportCategory;
  shareMode: boolean;
}) {
  if (category.weeklyItems.length === 0) {
    return null;
  }

  return (
    <section>
      <h3
        className={
          shareMode
            ? "text-[1.5rem] font-semibold text-[#1d1d1f]"
            : "text-[1.125rem] font-semibold text-[#1d1d1f]"
        }
      >
        {category.icon} {category.title}
      </h3>
      <ul className="mt-3">
        {category.weeklyItems.map((item) => (
          <LineItemRow key={item.transactionId} item={item} shareMode={shareMode} />
        ))}
      </ul>
    </section>
  );
}

function StatRow({
  label,
  amount,
  unit,
  shareMode,
  large = false,
}: {
  label: string;
  amount: number | null;
  unit: "NTD" | "VP";
  shareMode: boolean;
  large?: boolean;
}) {
  return (
    <div className={large && shareMode ? "space-y-2 py-3" : "flex items-baseline justify-between gap-4 py-2"}>
      <span
        className={
          shareMode && large
            ? "text-[1.25rem] font-medium text-[#636366]"
            : "text-[0.9375rem] text-[#86868b]"
        }
      >
        {label}：
      </span>
      <span
        className={
          shareMode && large
            ? "text-[2rem] font-semibold tracking-tight text-[#1d1d1f]"
            : shareMode
              ? "text-[1.375rem] font-semibold text-[#1d1d1f]"
              : "text-[1rem] font-semibold text-[#1d1d1f]"
        }
      >
        {amount === null ? "—" : formatReportAmount(amount, unit)}
      </span>
    </div>
  );
}

function ReportView({
  metrics,
  shareMode,
  onToggleShareMode,
}: {
  metrics: MemberComputedMetrics;
  shareMode: boolean;
  onToggleShareMode: () => void;
}) {
  const report = metrics.retailWeeklyReport;
  const hasWeeklyItems = report.categories.some((category) => category.weeklyItems.length > 0);

  return (
    <div
      className={`min-h-full bg-[linear-gradient(180deg,#fafafa_0%,#f5f5f7_48%,#eef0f4_100%)] ${shareMode ? "share-mode" : ""}`}
    >
      <main
        className={`mx-auto flex w-full flex-col px-5 pb-24 pt-12 ${shareMode ? "max-w-3xl" : "max-w-md"}`}
      >
        {!shareMode ? (
          <div className="mb-6 flex items-center justify-between">
            <Link className="text-[0.8125rem] font-medium text-[#0071e3]" href="/">
              ← 返回首頁
            </Link>
            <Link className="text-[0.8125rem] font-medium text-[#0071e3]" href="/retail/new">
              新增成交
            </Link>
          </div>
        ) : null}

        <header className={`animate-fade-up space-y-3 ${shareMode ? "text-center" : ""}`}>
          <p className="text-[0.8125rem] font-medium tracking-wide text-[#aeaeb2]">Baki GO</p>
          <h1
            className={
              shareMode
                ? "text-[2.5rem] font-semibold leading-tight tracking-tight text-[#1d1d1f]"
                : "text-[1.875rem] font-semibold leading-tight tracking-tight text-[#1d1d1f]"
            }
          >
            本週零售屋分享
          </h1>
          <p
            className={
              shareMode
                ? "text-[1.125rem] text-[#86868b]"
                : "text-[0.9375rem] text-[#86868b]"
            }
          >
            {formatReportDateRange(report.weekStartDate, report.weekEndDate)}
          </p>
        </header>

        <section
          className={`animate-fade-up mt-8 rounded-[1.75rem] bg-white/90 shadow-[0_8px_40px_rgba(0,0,0,0.04)] backdrop-blur-sm ${shareMode ? "p-10" : "p-6"}`}
          style={{ animationDelay: "80ms" }}
        >
          {hasWeeklyItems ? (
            report.categories.map((category, index) => (
              <div key={category.transactionTypeKey}>
                {index > 0 ? <Divider shareMode={shareMode} /> : null}
                <CategorySection category={category} shareMode={shareMode} />
              </div>
            ))
          ) : (
            <p className="text-center text-[0.9375rem] text-[#86868b]">本週尚無成交紀錄</p>
          )}

          <Divider shareMode={shareMode} />

          <section>
            <h3
              className={
                shareMode
                  ? "text-[1.5rem] font-semibold text-[#1d1d1f]"
                  : "text-[1.125rem] font-semibold text-[#1d1d1f]"
              }
            >
              本週統計
            </h3>
            <div className={`mt-4 ${shareMode ? "space-y-1" : "space-y-0"}`}>
              {report.categories.map((category) => (
                <StatRow
                  key={`week-${category.transactionTypeKey}`}
                  label={category.title}
                  amount={category.weeklyTotal}
                  unit={category.unit}
                  shareMode={shareMode}
                  large={shareMode}
                />
              ))}
            </div>
          </section>

          <Divider shareMode={shareMode} />

          <section>
            <h3
              className={
                shareMode
                  ? "text-[1.5rem] font-semibold text-[#1d1d1f]"
                  : "text-[1.125rem] font-semibold text-[#1d1d1f]"
              }
            >
              本月累積
            </h3>
            <p
              className={
                shareMode
                  ? "mt-2 text-[1rem] text-[#86868b]"
                  : "mt-1 text-[0.8125rem] text-[#86868b]"
              }
            >
              {formatReportYearMonth(report.yearMonth)}
            </p>
            <div className={`mt-4 ${shareMode ? "space-y-1" : "space-y-0"}`}>
              {report.categories.map((category) => (
                <StatRow
                  key={`month-${category.transactionTypeKey}`}
                  label={category.title}
                  amount={category.monthlyTotal}
                  unit={category.unit}
                  shareMode={shareMode}
                  large={shareMode}
                />
              ))}
            </div>
          </section>
        </section>

        {!shareMode ? (
          <button
            className="animate-fade-up mt-6 w-full rounded-[1.75rem] bg-[#1d1d1f] px-6 py-5 text-[1.0625rem] font-semibold text-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-transform duration-200 active:scale-[0.98]"
            onClick={onToggleShareMode}
            style={{ animationDelay: "160ms" }}
            type="button"
          >
            一鍵分享模式
          </button>
        ) : (
          <button
            className="fixed bottom-6 right-6 rounded-full bg-[#1d1d1f]/80 px-5 py-3 text-[0.875rem] font-medium text-white backdrop-blur-sm"
            onClick={onToggleShareMode}
            type="button"
          >
            退出分享
          </button>
        )}
      </main>
    </div>
  );
}

export default function RetailWeeklyReportPage() {
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [shareMode, setShareMode] = useState(false);

  useEffect(() => {
    setMetrics(loadMissionControlMetrics());
  }, []);

  if (!metrics) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#f5f5f7] text-[#86868b]">
        載入中…
      </div>
    );
  }

  return (
    <ReportView
      metrics={metrics}
      shareMode={shareMode}
      onToggleShareMode={() => setShareMode((current) => !current)}
    />
  );
}
