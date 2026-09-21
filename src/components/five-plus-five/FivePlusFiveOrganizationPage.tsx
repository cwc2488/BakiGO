"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FivePlusFiveShell } from "@/components/five-plus-five/FivePlusFiveShell";
import { copyTextToClipboard } from "@/lib/five-plus-five/clipboard";
import { formatOrganizationWarReport } from "@/lib/five-plus-five/copy-report";
import { fetchFivePlusFiveOrganization } from "@/lib/five-plus-five/client";
import { generationLabel } from "@/lib/five-plus-five/org-access";
import { dayStatusLabel } from "@/lib/five-plus-five/stats";
import type { FivePlusFiveOrgMemberStatus, FivePlusFiveOrgSummary } from "@/types/five-plus-five";

type FilterKey = "all" | "gen1" | "not_reported" | "fish_unmet" | "invite_unmet";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "gen1", label: "我的一代" },
  { key: "not_reported", label: "尚未回報" },
  { key: "fish_unmet", label: "魚池未達標" },
  { key: "invite_unmet", label: "邀約5步驟未達標" },
];

function matchesFilter(member: FivePlusFiveOrgMemberStatus, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "gen1":
      return member.generation === 1;
    case "not_reported":
      return !member.hasTodayReport;
    case "fish_unmet":
      return member.hasTodayReport && !member.todayFishMet;
    case "invite_unmet":
      return !member.weekInvitationMet;
    default:
      return true;
  }
}

export default function FivePlusFiveOrganizationPage() {
  const [summary, setSummary] = useState<FivePlusFiveOrgSummary | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchFivePlusFiveOrganization();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const visible = useMemo(() => {
    if (!summary) return [];
    const q = query.trim().toLowerCase();
    return summary.members.filter((m) => {
      if (!matchesFilter(m, filter)) return false;
      if (!q) return true;
      return m.memberName.toLowerCase().includes(q);
    });
  }, [summary, filter, query]);

  async function copySummary() {
    if (!summary) return;
    const text = formatOrganizationWarReport(summary);
    const result = await copyTextToClipboard(text);
    setToast(result.ok ? "已複製，可以直接貼到群組" : "複製失敗，請手動選取文字");
  }

  return (
    <FivePlusFiveShell title="5＋5 行動" subtitle="我的組織">
      {loading ? (
        <p className="text-[0.875rem] text-[var(--brand-text-muted)]">載入中…</p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
      ) : null}

      {summary ? (
        <>
          <section className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5">
            <h2 className="text-[1.0625rem] font-semibold text-[var(--brand-text)]">
              我的組織｜{summary.totalMembers}人
            </h2>
            <dl className="mt-4 space-y-2 text-[0.9375rem] text-[var(--brand-text)]">
              <div className="flex justify-between gap-3">
                <dt>今日已回報</dt>
                <dd className="tabular-nums font-semibold">
                  {summary.reportedToday} / {summary.totalMembers}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>今日魚池達標</dt>
                <dd className="tabular-nums font-semibold">
                  {summary.fishMetToday} / {summary.totalMembers}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>本週邀約5步驟達標</dt>
                <dd className="tabular-nums font-semibold">
                  {summary.invitationMetThisWeek} / {summary.totalMembers}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => void copySummary()}
              className="mt-4 flex min-h-11 w-full items-center justify-center rounded-[0.875rem] border border-[var(--brand-border)] text-[0.875rem] font-semibold"
            >
              📋 複製今日組織摘要
            </button>
          </section>

          <div className="space-y-3">
            <input
              type="search"
              placeholder="搜尋姓名"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2.5 text-[0.9375rem]"
            />
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`rounded-full px-3 py-1.5 text-[0.75rem] font-semibold ${
                    filter === item.key
                      ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
                      : "bg-[var(--brand-surface)] text-[var(--brand-text-secondary)] border border-[var(--brand-border)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <ul className="space-y-3">
            {visible.map((member) => (
              <li key={member.memberId}>
                <Link
                  href={`/5plus5/member/${member.memberId}`}
                  className="block rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4 active:bg-[var(--brand-primary-muted)]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[1rem] font-semibold text-[var(--brand-text)]">
                      {member.memberName}
                      <span className="ml-2 text-[0.8125rem] font-medium text-[var(--brand-text-muted)]">
                        {generationLabel(member.generation)}
                      </span>
                    </p>
                    <span className="text-[0.75rem] text-[var(--brand-hint)]">查看回報 →</span>
                  </div>
                  <p className="mt-3 text-[0.875rem] text-[var(--brand-text)]">
                    🐟 今日魚池 {member.todayFish ?? "—"} / {summary.targets.fishPoolDaily}
                  </p>
                  <p className="text-[0.875rem] text-[var(--brand-text)]">
                    🎯 本週邀約5步驟 {member.weekInvitation} /{" "}
                    {summary.targets.invitationFiveStepsWeekly}
                  </p>
                  <p className="mt-2 text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">
                    今日狀態：{dayStatusLabel(member.todayStatus)}
                  </p>
                </Link>
              </li>
            ))}
            {visible.length === 0 ? (
              <li className="text-center text-[0.875rem] text-[var(--brand-text-muted)]">
                沒有符合條件的夥伴
              </li>
            ) : null}
          </ul>
        </>
      ) : null}

      {toast ? (
        <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[120] mx-auto max-w-md rounded-2xl bg-[#1d1d1f] px-4 py-3 text-center text-[0.875rem] font-medium text-white shadow-lg md:bottom-8">
          {toast}
        </div>
      ) : null}
    </FivePlusFiveShell>
  );
}
