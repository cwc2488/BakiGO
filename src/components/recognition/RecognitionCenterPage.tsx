"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { fetchRecognitionEvents } from "@/lib/recognition/recognition-fetch";
import type { RecognitionEventStatus, RecognitionEventSummary } from "@/types/recognition";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const STATUS_LABELS: Record<RecognitionEventStatus, string> = {
  draft:      "草稿",
  collecting: "收件中",
  closed:     "已截止",
  archived:   "已封存",
};

const STATUS_COLORS: Record<RecognitionEventStatus, string> = {
  draft:      "#86868b",
  collecting: "#248a3d",
  closed:     "#ff9f0a",
  archived:   "#636366",
};

const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"] as const;

const SELECT_CLASS =
  "appearance-none rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-[0.875rem] outline-none focus:border-[var(--brand-primary)]";

function StatusPill({ status }: { status: RecognitionEventStatus }) {
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold text-white"
      style={{ backgroundColor: STATUS_COLORS[status] }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function EventCard({ event }: { event: RecognitionEventSummary }) {
  const monthLabel = MONTH_LABELS[(event.month - 1)] ?? `${event.month}月`;

  return (
    <Link href={`/recognition/events/${event.id}`} className="block">
      <BrandCard variant="bordered" className="transition-shadow hover:shadow-md active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.8125rem] text-[#86868b]">
              {event.year} / {monthLabel}
            </p>
            <h2 className="mt-0.5 text-[1rem] font-semibold text-[#1d1d1f] truncate">{event.name}</h2>
          </div>
          <StatusPill status={event.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[0.75rem]">
          <span className="rounded-full bg-[#e8f8ed] px-2.5 py-1 font-medium text-[#248a3d]">
            已核准 {event.approvedCount}
          </span>
          <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 font-medium text-[#1d1d1f]">
            待處理 {event.problemCount}
          </span>
        </div>
      </BrandCard>
    </Link>
  );
}

export function RecognitionCenterPage() {
  const [events, setEvents] = useState<RecognitionEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");

  const loadEvents = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchRecognitionEvents()
      .then((data) => { setEvents(data); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "無法載入表揚活動"); })
      .finally(() => { setLoading(false); });
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const years = useMemo(
    () => [...new Set(events.map((event) => event.year))].sort((a, b) => b - a),
    [events],
  );

  const visibleEvents = events.filter((event) => {
    if (year !== "all" && event.year !== Number(year)) return false;
    if (month !== "all" && event.month !== Number(month)) return false;
    return true;
  });

  return (
    <PageShell title="表揚中心" subtitle="管理表揚活動、審核名單、準備簡報" backHref="/admin" backLabel="返回管理中心">
      <div className="flex justify-end">
        <Link
          href="/recognition/events/new"
          className="rounded-2xl bg-[#1d1d1f] px-4 py-2.5 text-[0.9375rem] font-semibold text-white transition-transform active:scale-[0.98]"
        >
          + 建立活動
        </Link>
      </div>

      {!loading && events.length > 0 && (
        <div className="flex gap-2">
          <select className={SELECT_CLASS} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">全部年份</option>
            {years.map((value) => (
              <option key={value} value={value}>{value} 年</option>
            ))}
          </select>
          <select className={SELECT_CLASS} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">全部月份</option>
            {MONTH_LABELS.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {loading && (
        <p className="text-center text-[0.9375rem] text-[#86868b]">載入中…</p>
      )}

      {!loading && error && (
        <BrandCard variant="bordered">
          <p className="text-[0.9375rem] text-[#ff375f]">{error}</p>
          <button
            onClick={() => void loadEvents()}
            className="mt-3 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
            type="button"
          >
            重試
          </button>
        </BrandCard>
      )}

      {!loading && !error && visibleEvents.length === 0 && (
        <BrandCard variant="bordered">
          <p className="text-center text-[0.9375rem] text-[#86868b]">尚無表揚活動</p>
          <p className="mt-1 text-center text-[0.875rem] text-[#86868b]">同一個月份可以有多個活動。</p>
        </BrandCard>
      )}

      {!loading && !error && visibleEvents.length > 0 && (
        <div className="flex flex-col gap-3">
          {visibleEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
