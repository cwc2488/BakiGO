"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/ui/PageShell";
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
        const qs = debouncedQuery
          ? `?q=${encodeURIComponent(debouncedQuery)}`
          : "";
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
    <PageShell
      backHref="/training"
      backLabel="返回培訓檢核"
      subtitle="點擊夥伴查看其培訓檢核"
      title="我的組織"
    >
      <label className="block space-y-2">
        <span className="px-0.5 text-[0.8125rem] font-medium text-[var(--brand-text-muted)]">
          搜尋姓名
        </span>
        <input
          className="min-h-11 w-full rounded-[0.875rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3.5 text-[1rem] text-[var(--brand-text)] outline-none focus:border-[var(--brand-primary)]"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="輸入姓名"
          type="search"
          value={query}
        />
      </label>

      {error ? (
        <p className="rounded-[1.25rem] border border-[#ffd0d0] bg-[#fff5f5] px-4 py-4 text-[0.9375rem] text-[#c62828]">
          {error}
        </p>
      ) : null}

      {!loading && members.length === 0 ? (
        <p className="rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4 text-[0.9375rem] text-[var(--brand-text-muted)]">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {members.map((member) => (
            <li key={member.memberId}>
              <Link
                className="block rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 transition-opacity active:opacity-80"
                href={`/training/${member.memberId}`}
              >
                <p className="break-words text-[1.0625rem] font-semibold text-[var(--brand-text)]">
                  {member.displayName}
                </p>
                <p className="mt-1 text-[0.875rem] text-[var(--brand-text-muted)]">
                  尚未完成 {member.incompleteCount} 項
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
