"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type { RadarTodayItem, RadarTodayResponse } from "@/lib/radar/today/build-today-response";
import { APP_ICON } from "@/lib/ui/app-icons";

type LoadState = "loading" | "ready" | "empty" | "error";

function CandidateCard({ item }: { item: RadarTodayItem }) {
  const reasons = item.why_now.length > 0 ? item.why_now : item.recommendation_reasons;
  return (
    <article className="rounded-[1.125rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] px-4 py-3.5 shadow-[0_1px_2px_rgba(29,29,31,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.75rem] font-medium text-[var(--brand-text-muted)]">#{item.rank}</p>
          <h2 className="mt-0.5 truncate text-[1rem] font-semibold text-[var(--brand-text)]">
            {item.display_name?.trim() || "推薦對象"}
          </h2>
          {item.primary_need?.label || item.primary_need?.need_id ? (
            <p className="mt-1 text-[0.8125rem] text-[var(--brand-text-secondary)]">
              {item.primary_need.label ?? item.primary_need.need_id}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 text-[1.125rem] font-semibold tabular-nums text-[var(--brand-primary-dark)]">
          {item.display_overall_score}
        </p>
      </div>
      {reasons.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="text-[0.8125rem] leading-relaxed text-[var(--brand-text-muted)]">
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function RadarPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [feed, setFeed] = useState<RadarTodayResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("無法載入 AI Radar");

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetchWithMemberAuth("/api/radar/today");
      if (response.status === 404) {
        setFeed(null);
        setLoadState("empty");
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "無法載入推薦名單");
      }
      const data = (await response.json()) as RadarTodayResponse;
      setFeed(data);
      setLoadState(data.items.length === 0 ? "empty" : "ready");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "無法載入 AI Radar");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell
      backHref="/customers"
      backLabel="返回顧客"
      subtitle="智慧找人"
      title="AI Radar"
      titleIcon={APP_ICON.section.aiAnalysis}
    >
      {loadState === "loading" ? (
        <p className="py-10 text-center text-[0.9375rem] text-[var(--brand-text-muted)]">載入推薦中…</p>
      ) : null}

      {loadState === "error" ? (
        <div className="rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-5 py-8 text-center">
          <p className="text-[0.9375rem] text-[var(--brand-text-secondary)]">{errorMessage}</p>
          <button
            className="mt-4 min-h-11 rounded-full bg-[var(--brand-text)] px-5 text-[0.875rem] font-semibold text-white"
            onClick={() => void load()}
            type="button"
          >
            重新載入
          </button>
        </div>
      ) : null}

      {loadState === "empty" ? (
        <div className="rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-5 py-8 text-center">
          <p className="text-[1rem] font-semibold text-[var(--brand-text)]">今天還沒有推薦名單</p>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--brand-text-muted)]">
            名單會依你自己的推薦產生。沒有名單時不會用假資料補滿。
          </p>
        </div>
      ) : null}

      {loadState === "ready" && feed ? (
        <div className="space-y-3">
          <p className="px-0.5 text-[0.8125rem] text-[var(--brand-text-muted)]">
            今天有 {feed.effective_item_count} 位推薦 · {feed.snapshot_date}
          </p>
          {feed.items.map((item) => (
            <CandidateCard key={item.candidate_id} item={item} />
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
