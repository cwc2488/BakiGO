"use client";

import { fetchRecognitionEvents } from "@/lib/recognition/recognition-fetch";
import type { RecognitionEvent, RecognitionEventStatus } from "@/types/recognition";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

function EventCard({ event }: { event: RecognitionEvent }) {
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
        {(event.collectStartsAt || event.collectEndsAt) && (
          <p className="mt-2 text-[0.8125rem] text-[#86868b]">
            {event.collectStartsAt
              ? `收件開始 ${new Date(event.collectStartsAt).toLocaleDateString("zh-TW")}`
              : ""}
            {event.collectStartsAt && event.collectEndsAt ? " — " : ""}
            {event.collectEndsAt
              ? `截止 ${new Date(event.collectEndsAt).toLocaleDateString("zh-TW")}`
              : ""}
          </p>
        )}
      </BrandCard>
    </Link>
  );
}

export function RecognitionCenterPage() {
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <PageShell title="表揚中心" subtitle="管理表揚活動、審核名單、準備簡報">
      <div className="flex justify-end">
        <Link
          href="/recognition/events/new"
          className="rounded-2xl bg-[#1d1d1f] px-4 py-2.5 text-[0.9375rem] font-semibold text-white transition-transform active:scale-[0.98]"
        >
          + 建立活動
        </Link>
      </div>

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

      {!loading && !error && events.length === 0 && (
        <BrandCard variant="bordered">
          <p className="text-center text-[0.9375rem] text-[#86868b]">尚無表揚活動</p>
          <p className="mt-1 text-center text-[0.875rem] text-[#86868b]">點右上角「+ 建立活動」開始</p>
        </BrandCard>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">即將推出</p>
        <p className="mt-1 text-[0.9375rem] font-semibold text-[#1d1d1f]">公開收件、審核、PPT 預覽</p>
        <p className="mt-1 text-[0.875rem] text-[#86868b]">Phase 4+ 功能，目前尚未開放。</p>
      </div>
    </PageShell>
  );
}
