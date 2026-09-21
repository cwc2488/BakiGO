"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TabRootShell } from "@/components/ui/TabRootShell";
import {
  QUESTIONNAIRE_INTEREST_OPTIONS,
  QUESTIONNAIRE_LEAD_STATUS_LABEL,
  QUESTIONNAIRE_LEAD_STATUSES,
} from "@/lib/questionnaire/contract";
import { fetchQuestionnaireLeads } from "@/lib/questionnaire/client";
import type { QuestionnaireLeadSummary } from "@/types/questionnaire";

const FILTERS = [
  { value: "", label: "全部" },
  { value: "new", label: "未聯絡" },
  { value: "contacted", label: "已聯絡" },
  { value: "invitation_started", label: "邀約5步驟" },
  { value: "completed", label: "已完成" },
  { value: "paused", label: "暫不追蹤" },
] as const;

function interestLabel(level: string | null): string {
  const found = QUESTIONNAIRE_INTEREST_OPTIONS.find((o) => o.value === level);
  return found?.partnerLabel ?? "—";
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function QuestionnaireLeadsPage() {
  const [leads, setLeads] = useState<QuestionnaireLeadSummary[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchQuestionnaireLeads({
        status: status || undefined,
        search: search.trim() || undefined,
        page,
      });
      setLeads(result.leads);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TabRootShell
      header={
        <header className="space-y-3">
          <Link
            href="/questionnaire"
            className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]"
          >
            ← 問卷開發
          </Link>
          <h1 className="text-[1.5rem] font-semibold tracking-tight text-[var(--brand-text)]">
            我的問卷名單
          </h1>
        </header>
      }
    >
      <div className="space-y-4">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="搜尋姓名／暱稱"
          className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
        />

        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((filter) => (
            <button
              key={filter.value || "all"}
              type="button"
              onClick={() => {
                setPage(1);
                setStatus(filter.value);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold ${
                status === filter.value
                  ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
                  : "bg-[var(--brand-surface)] text-[var(--brand-text-secondary)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-[0.875rem] text-[var(--brand-text-muted)]">載入中…</p>
        ) : null}
        {error ? (
          <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
        ) : null}

        {!loading && leads.length === 0 ? (
          <p className="text-[0.9375rem] text-[var(--brand-text-secondary)]">還沒有問卷名單</p>
        ) : null}

        <ul className="space-y-3">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/questionnaire/leads/${lead.id}`}
                className="block space-y-2 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4 active:bg-[var(--brand-primary-muted)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[1.0625rem] font-semibold text-[var(--brand-text)]">
                    {lead.displayName}
                  </p>
                  <span className="shrink-0 text-[0.75rem] font-medium text-[var(--brand-text-muted)]">
                    {QUESTIONNAIRE_LEAD_STATUS_LABEL[
                      lead.status as (typeof QUESTIONNAIRE_LEAD_STATUSES)[number]
                    ] ?? lead.status}
                  </span>
                </div>
                <div>
                  <p className="text-[0.75rem] font-semibold text-[var(--brand-text-muted)]">
                    🔥 核心需求
                  </p>
                  <p className="text-[0.9375rem] text-[var(--brand-text)]">
                    {lead.primaryNeed ?? "—"}
                  </p>
                </div>
                {lead.needTags.length > 0 ? (
                  <p className="text-[0.8125rem] text-[var(--brand-text-secondary)]">
                    標籤：{lead.needTags.join("、")}
                  </p>
                ) : null}
                <p className="text-[0.8125rem] text-[var(--brand-text-secondary)]">
                  健康食品：{lead.usesSupplements == null ? "—" : lead.usesSupplements ? "有" : "沒有"}
                </p>
                <p className="text-[0.8125rem] text-[var(--brand-text-secondary)]">
                  意願：{interestLabel(lead.interestLevel)}
                </p>
                <p className="text-[0.75rem] text-[var(--brand-text-muted)]">
                  {formatTime(lead.lastResponseAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        {(page > 1 || hasMore) && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex-1 rounded-[0.875rem] border border-[var(--brand-border)] py-2.5 text-[0.875rem] font-semibold disabled:opacity-40"
            >
              上一頁
            </button>
            <button
              type="button"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
              className="flex-1 rounded-[0.875rem] border border-[var(--brand-border)] py-2.5 text-[0.875rem] font-semibold disabled:opacity-40"
            >
              下一頁
            </button>
          </div>
        )}
      </div>
    </TabRootShell>
  );
}
