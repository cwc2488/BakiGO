"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type { LeadTracking, LeadTrackingFilter } from "@/lib/lead-tracking/types";
import {
  formatFollowUpLabel,
  summarizeStatus,
} from "@/lib/lead-tracking/list-utils";

const FILTERS: { id: LeadTrackingFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "today", label: "今天" },
  { id: "overdue", label: "已逾期" },
  { id: "future", label: "未來" },
];

export default function LeadTrackingListPage() {
  const [filter, setFilter] = useState<LeadTrackingFilter>("all");
  const [leads, setLeads] = useState<LeadTracking[]>([]);
  const [badges, setBadges] = useState({ today: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextFilter: LeadTrackingFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithMemberAuth(`/api/lead-tracking?filter=${nextFilter}&limit=100`);
      if (!res.ok) {
        throw new Error("無法載入名單");
      }
      const data = (await res.json()) as {
        leads: LeadTracking[];
        badges: { today: number; overdue: number };
      };
      setLeads(data.leads);
      setBadges(data.badges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load(filter);
    });
  }, [filter, load]);

  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (badges.overdue > 0) parts.push(`逾期 ${badges.overdue}`);
    if (badges.today > 0) parts.push(`今天 ${badges.today}`);
    return parts.length > 0 ? parts.join(" · ") : "把人記下來，到時提醒我";
  }, [badges]);

  return (
    <PageShell
      backHref="/customers"
      backLabel="返回顧客"
      headerExtra={
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--brand-primary)] px-4 text-[0.875rem] font-semibold text-white"
          href="/lead-tracking/new"
        >
          新增
        </Link>
      }
      subtitle={subtitle}
      title="名單追蹤"
      variant="plain"
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors ${
                active
                  ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
                  : "bg-[var(--brand-surface)] text-[var(--brand-text-muted)]"
              }`}
              onClick={() => setFilter(item.id)}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-2 pt-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-[var(--brand-border)]/60" />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="pt-4 text-center text-[0.875rem] text-[#b42318]">{error}</p>
      ) : null}

      {!loading && !error && leads.length === 0 ? (
        <p className="pt-8 text-center text-[0.875rem] text-[var(--brand-text-muted)]">
          還沒有名單。先記下一位想追蹤的人。
        </p>
      ) : null}

      {!loading && leads.length > 0 ? (
        <ul className="divide-y divide-[var(--brand-border)]/70 overflow-hidden rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)]">
          {leads.map((lead) => {
            const status = summarizeStatus(lead.currentStatus);
            return (
              <li key={lead.id}>
                <Link
                  className="flex min-h-[3.25rem] items-start justify-between gap-3 px-4 py-3 transition-colors active:bg-[var(--brand-primary-muted)]"
                  href={`/lead-tracking/${lead.id}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-semibold text-[var(--brand-text)]">
                      {lead.name}
                    </span>
                    {status ? (
                      <span className="mt-0.5 block truncate text-[0.8125rem] text-[var(--brand-text-muted)]">
                        {status}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 pt-0.5 text-right text-[0.75rem] font-medium text-[var(--brand-text-muted)]">
                    {formatFollowUpLabel(lead.nextFollowUpAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </PageShell>
  );
}
