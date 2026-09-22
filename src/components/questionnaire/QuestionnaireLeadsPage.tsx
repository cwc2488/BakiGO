"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TabRootShell } from "@/components/ui/TabRootShell";
import {
  QUESTIONNAIRE_INTEREST_OPTIONS,
  QUESTIONNAIRE_LEAD_STATUS_LABEL,
  QUESTIONNAIRE_LEAD_STATUSES,
} from "@/lib/questionnaire/contract";
import {
  fetchQuestionnaireLeads,
  isQuestionnaireLeadsFresh,
  prefetchQuestionnaireLead,
  readCachedQuestionnaireLeads,
} from "@/lib/questionnaire/client";
import type { QuestionnaireLeadSummary } from "@/types/questionnaire";

const FILTERS = [
  { value: "", label: "全部" },
  { value: "new", label: "未聯絡" },
  { value: "contacted", label: "已聯絡" },
  { value: "invitation_started", label: "邀約5步驟" },
  { value: "completed", label: "已完成" },
  { value: "paused", label: "暫不追蹤" },
] as const;

const SEARCH_DEBOUNCE_MS = 300;

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
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [leads, setLeads] = useState<QuestionnaireLeadSummary[]>(() => {
    const cached = readCachedQuestionnaireLeads({ status: "", search: "", page: 1 });
    return cached?.leads ?? [];
  });
  const [hasMore, setHasMore] = useState(() => {
    const cached = readCachedQuestionnaireLeads({ status: "", search: "", page: 1 });
    return cached?.hasMore ?? false;
  });
  const [coldLoading, setColdLoading] = useState(() => {
    return !readCachedQuestionnaireLeads({ status: "", search: "", page: 1 });
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleHint, setStaleHint] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 300ms debounce for search
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    const query = { status, search: debouncedSearch, page };
    const cached = readCachedQuestionnaireLeads(query);

    if (cached) {
      setLeads(cached.leads);
      setHasMore(cached.hasMore);
      setColdLoading(false);
      setError(null);
      // Fresh → skip network
      if (isQuestionnaireLeadsFresh(query)) {
        setRefreshing(false);
        return;
      }
      setRefreshing(true);
    } else {
      // Filter/page changed with no cache for this key — never show previous filter leads
      setLeads([]);
      setHasMore(false);
      setColdLoading(true);
      setRefreshing(false);
      setStaleHint(null);
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      setError(null);
      try {
        const result = await fetchQuestionnaireLeads(
          {
            status: status || undefined,
            search: debouncedSearch || undefined,
            page,
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setLeads(result.leads);
        setHasMore(result.hasMore);
        setStaleHint(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && /abort/i.test(err.message)) return;
        if (cached) {
          setStaleHint("更新失敗，顯示上次資料");
        } else {
          setError(err instanceof Error ? err.message : "載入失敗");
        }
      } finally {
        if (!controller.signal.aborted) {
          setColdLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [status, debouncedSearch, page]);

  function warmLead(leadId: string) {
    router.prefetch(`/questionnaire/leads/${leadId}`);
    prefetchQuestionnaireLead(leadId);
  }

  return (
    <TabRootShell
      header={
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/questionnaire"
              className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]"
            >
              ← 問卷開發
            </Link>
            {refreshing ? (
              <p className="text-[0.6875rem] text-[var(--brand-hint)]">更新中…</p>
            ) : null}
          </div>
          <h1 className="text-[1.5rem] font-semibold tracking-tight text-[var(--brand-text)]">
            我的問卷名單
          </h1>
        </header>
      }
    >
      <div className="space-y-4">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => {
            setPage(1);
            setSearchInput(e.target.value);
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

        {staleHint ? (
          <p className="text-[0.75rem] text-[var(--brand-text-muted)]">{staleHint}</p>
        ) : null}

        {coldLoading && leads.length === 0 ? (
          <div className="space-y-3 animate-pulse" aria-busy="true">
            <div className="h-24 rounded-[1.25rem] bg-[var(--brand-primary-muted)]" />
            <div className="h-24 rounded-[1.25rem] bg-[var(--brand-primary-muted)]" />
          </div>
        ) : null}

        {error && leads.length === 0 ? (
          <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
        ) : null}

        {!coldLoading && leads.length === 0 && !error ? (
          <p className="text-[0.9375rem] text-[var(--brand-text-secondary)]">還沒有問卷名單</p>
        ) : null}

        <ul className="space-y-3">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/questionnaire/leads/${lead.id}`}
                onPointerEnter={() => warmLead(lead.id)}
                onTouchStart={() => warmLead(lead.id)}
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

export { SEARCH_DEBOUNCE_MS };
