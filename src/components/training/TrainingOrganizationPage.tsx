"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  TRAINING_SURFACE,
  TRAINING_SURFACE_SOFT,
  TrainingFeedbackBanner,
  TrainingPageFrame,
  TrainingStatusChip,
} from "@/components/training/training-ui";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type { TrainingOrgMemberSummary } from "@/types/training-checklist";

export function TrainingOrganizationPage() {
  const [members, setMembers] = useState<TrainingOrgMemberSummary[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : "";
        const response = await fetchWithMemberAuth(`/api/training/organization${qs}`);
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          members?: TrainingOrgMemberSummary[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "無法載入組織");
        }
        if (!cancelled) {
          setMembers(payload.members ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "無法載入組織");
          setMembers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const emptyLabel = useMemo(() => {
    if (loading) return "載入中…";
    if (debouncedQuery) return "找不到符合的夥伴";
    return "目前沒有可查看的下線";
  }, [debouncedQuery, loading]);

  return (
    <TrainingPageFrame backHref="/training" backLabel="返回培訓檢核">
      <header className="home-section space-y-2">
        <h1 className="text-[2rem] font-semibold tracking-tight text-[var(--brand-text)]">
          我的組織
        </h1>
        <p className="text-[0.9375rem] leading-relaxed text-[var(--brand-text-secondary)]">
          選擇夥伴，檢視並簽核其培訓進度。
        </p>
      </header>

      <label className="home-section block space-y-2">
        <span className="px-0.5 text-[0.8125rem] font-medium text-[var(--brand-text-muted)]">
          搜尋姓名
        </span>
        <input
          className="min-h-11 w-full rounded-[0.95rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] px-3.5 text-[1rem] text-[var(--brand-text)] outline-none transition-[border-color,box-shadow] focus:border-[var(--brand-primary-dark)] focus:shadow-[0_0_0_3px_rgba(36,138,61,0.12)]"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="輸入姓名"
          type="search"
          value={query}
        />
      </label>

      <div className="home-section space-y-2.5">
        {error ? <TrainingFeedbackBanner tone="error">{error}</TrainingFeedbackBanner> : null}

        {loading ? (
          <ul className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <li
                key={index}
                className={`${TRAINING_SURFACE} h-[4.25rem] animate-pulse`}
              />
            ))}
          </ul>
        ) : members.length === 0 ? (
          <p className={`${TRAINING_SURFACE} px-4 py-5 text-[0.9375rem] text-[var(--brand-text-muted)]`}>
            {emptyLabel}
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((member) => {
              const complete = member.incompleteCount === 0;
              return (
                <li key={member.memberId}>
                  <Link
                    className={`flex min-h-[4.25rem] items-center gap-3 px-4 py-3 transition-[opacity,transform] active:scale-[0.99] active:opacity-90 ${
                      complete ? TRAINING_SURFACE_SOFT : TRAINING_SURFACE
                    }`}
                    href={`/training/${member.memberId}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[1.0625rem] font-semibold tracking-tight text-[var(--brand-text)]">
                        {member.displayName}
                      </p>
                      {complete ? (
                        <div className="mt-1.5">
                          <TrainingStatusChip tone="verified">全部完成</TrainingStatusChip>
                        </div>
                      ) : (
                        <p className="mt-1 text-[0.8125rem] text-[var(--brand-text-muted)]">
                          尚未完成 {member.incompleteCount} 項
                        </p>
                      )}
                    </div>
                    <span
                      aria-hidden
                      className="shrink-0 text-[1.25rem] leading-none text-[var(--brand-hint)]"
                    >
                      {complete ? "✓" : "›"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </TrainingPageFrame>
  );
}
