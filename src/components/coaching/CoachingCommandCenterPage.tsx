"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import {
  buildWorkbenchTodaySummary,
  buildWorkbenchUrgentCards,
  COACH_TODAY_REPORT_LABELS,
  resolveCoachTodayReportState,
  type WorkbenchUrgentCard,
} from "@/lib/coaching/presentation/coaching-workbench-presentation";
import { useSoftRefresh } from "@/lib/hooks/use-soft-refresh";
import type { CoachingCommandCenterCard } from "@/types/coaching-attention";

type CommandCenterResponse = {
  ok?: boolean;
  asOfLogDate?: string;
  counts?: {
    needsAttention: number;
    watch: number;
    measurementDue: number;
    positiveProgress: number;
    routine: number;
    total: number;
  };
  sections?: {
    needsAttention: CoachingCommandCenterCard[];
    watch: CoachingCommandCenterCard[];
    measurementDue: CoachingCommandCenterCard[];
    positiveProgress: CoachingCommandCenterCard[];
    allActive: CoachingCommandCenterCard[];
  };
  error?: string;
};

type RosterFilter = "all" | "reported" | "not_reported";

function UrgentCard({ card }: { card: WorkbenchUrgentCard }) {
  return (
    <article className="rounded-[1.25rem] border border-[#e8ece4] bg-white px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff1f0] text-[1rem] font-semibold text-[#b42318]"
          aria-hidden
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[1.0625rem] font-semibold leading-snug text-[#1d1d1f] break-words">
            {card.customerDisplayName}
          </p>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-[#1d1d1f] break-words">
            {card.whatHappened}
          </p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[#636366] break-words">{card.nextStep}</p>
          <Link
            href={card.detailHref}
            className="mt-3 inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-full bg-[#1d1d1f] px-5 text-[0.875rem] font-medium text-white"
          >
            查看
          </Link>
        </div>
      </div>
    </article>
  );
}

function CompactRow({ card }: { card: CoachingCommandCenterCard }) {
  const state = resolveCoachTodayReportState({
    todaySubmitted: Boolean(card.todaySubmitted),
    todayAiStatus: card.todayAiStatus,
  });
  return (
    <Link
      href={card.detailHref}
      className="flex min-h-14 items-center justify-between gap-3 rounded-[1rem] border border-[#eef2ea] bg-white px-4 py-3"
    >
      <div className="min-w-0">
        <p className="truncate text-[0.9375rem] font-semibold text-[#1d1d1f]">{card.customerDisplayName}</p>
        <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">{COACH_TODAY_REPORT_LABELS[state]}</p>
      </div>
      <span className="shrink-0 text-[1.25rem] text-[#c7c7cc]" aria-hidden>
        ›
      </span>
    </Link>
  );
}

export default function CoachingCommandCenterPage() {
  const [logDate] = useState(coachingTodayLogDate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<CommandCenterResponse | null>(null);
  const [query, setQuery] = useState("");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("all");
  const [rosterOpen, setRosterOpen] = useState(false);

  const loadCommandCenter = useCallback(
    async (options?: { soft?: boolean }) => {
      if (!options?.soft) setLoading(true);
      setError(null);
      try {
        const response = await fetchCoachingWithMemberAuth(
          `/api/coaching/command-center?logDate=${encodeURIComponent(logDate)}`,
        );
        const body = (await response.json()) as CommandCenterResponse;
        if (!response.ok || !body.ok || !body.sections || !body.counts) {
          throw new Error(body.error ?? "無法載入陪跑中心");
        }
        setPayload(body);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "無法載入陪跑中心");
      } finally {
        if (!options?.soft) setLoading(false);
      }
    },
    [logDate],
  );

  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  useSoftRefresh(() => loadCommandCenter({ soft: true }));

  const allActive = payload?.sections?.allActive ?? [];

  const urgentCards = useMemo(() => buildWorkbenchUrgentCards(allActive), [allActive]);

  const todaySummary = useMemo(() => buildWorkbenchTodaySummary(allActive), [allActive]);

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    let list = allActive;
    if (q) {
      list = list.filter((card) => {
        if (card.customerDisplayName.toLowerCase().includes(q)) return true;
        if (card.goal?.toLowerCase().includes(q)) return true;
        if (card.customerPhone) {
          const phone = card.customerPhone.replace(/\D/g, "");
          if (digits.length >= 3 && phone.includes(digits)) return true;
          if (card.customerPhone.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    if (rosterFilter === "reported") {
      list = list.filter((card) => card.todaySubmitted);
    } else if (rosterFilter === "not_reported") {
      list = list.filter((card) => !card.todaySubmitted);
    }
    return list;
  }, [allActive, query, rosterFilter]);

  return (
    <PageShell backHref="/customers" backLabel="返回顧客" subtitle="今天的教練工作台" title="陪跑中心">
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="載入陪跑中心">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-[1.25rem] bg-[#f0f1ef]" />
          ))}
        </div>
      ) : null}
      {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}

      {!loading && !error && (payload?.counts?.total ?? 0) === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-[#e5e7eb] bg-white px-4 py-5 text-[0.9375rem] text-[#86868b]">
          目前沒有進行中的陪跑顧客。
        </p>
      ) : null}

      {!loading && !error && payload?.sections ? (
        <div className="space-y-8 pb-8">
          {/* A. 需要你處理 */}
          <section className="space-y-3">
            <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">需要你處理</h2>
            {urgentCards.length === 0 ? (
              <p className="rounded-[1.25rem] bg-[#f7faf5] px-4 py-4 text-[0.9375rem] text-[#3f6212]">
                目前沒有需要特別處理的顧客 ✓
              </p>
            ) : (
              urgentCards.map((card) => <UrgentCard key={card.enrollmentId} card={card} />)
            )}
          </section>

          {/* B. 今天的回報 */}
          <section className="space-y-3">
            <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">今天的回報</h2>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                className="min-h-12 rounded-[1rem] border border-[#eef2ea] bg-white px-4 py-3 text-left text-[0.9375rem] text-[#1d1d1f]"
                onClick={() => {
                  setRosterFilter("reported");
                  setRosterOpen(true);
                }}
              >
                今天已回報{" "}
                <span className="font-semibold">{todaySummary.reportedCount}</span> 人
              </button>
              <button
                type="button"
                className="min-h-12 rounded-[1rem] border border-[#eef2ea] bg-white px-4 py-3 text-left text-[0.9375rem] text-[#1d1d1f]"
                onClick={() => {
                  setRosterFilter("reported");
                  setRosterOpen(true);
                }}
              >
                等待進階分析{" "}
                <span className="font-semibold">{todaySummary.organizingCount}</span> 人
              </button>
              <button
                type="button"
                className="min-h-12 rounded-[1rem] border border-[#eef2ea] bg-white px-4 py-3 text-left text-[0.9375rem] text-[#1d1d1f]"
                onClick={() => {
                  setRosterFilter("not_reported");
                  setRosterOpen(true);
                }}
              >
                尚未回報 <span className="font-semibold">{todaySummary.notReportedCount}</span> 人
              </button>
            </div>
          </section>

          {/* C. 持續陪跑 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">持續陪跑</h2>
              <button
                type="button"
                className="min-h-11 px-2 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
                onClick={() => setRosterOpen((v) => !v)}
              >
                {rosterOpen ? "收合" : "展開"}
              </button>
            </div>

            {rosterOpen ? (
              <>
                <label className="block">
                  <span className="sr-only">搜尋顧客</span>
                  <input
                    className="min-h-11 w-full rounded-[1rem] border border-[#e5e7eb] bg-white px-4 text-[0.9375rem] text-[#1d1d1f] outline-none ring-[var(--brand-primary)] focus:ring-2"
                    placeholder="搜尋姓名或電話"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(
                    [
                      { id: "all", label: "全部" },
                      { id: "reported", label: "今天已回報" },
                      { id: "not_reported", label: "尚未回報" },
                    ] as const
                  ).map((item) => {
                    const active = rosterFilter === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`min-h-11 shrink-0 rounded-full px-4 text-[0.8125rem] font-medium ${
                          active ? "bg-[#1d1d1f] text-white" : "bg-[#f3f4f1] text-[#636366]"
                        }`}
                        onClick={() => setRosterFilter(item.id)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {roster.length === 0 ? (
                  <p className="text-[0.9375rem] text-[#86868b]">找不到符合條件的顧客。</p>
                ) : (
                  <div className="space-y-2">
                    {roster.map((card) => (
                      <CompactRow key={card.enrollmentId} card={card} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[0.875rem] text-[#86868b]">
                共 {allActive.length} 位進行中。需要找人時再展開搜尋。
              </p>
            )}
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}
