"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TabRootShell } from "@/components/ui/TabRootShell";
import { copyTextToClipboard } from "@/lib/five-plus-five/clipboard";
import { QUESTIONNAIRE_PUBLIC_COPY, QUESTIONNAIRE_SOURCE_LABEL } from "@/lib/questionnaire/contract";
import {
  fetchQuestionnaireDashboard,
  isQuestionnaireDashboardFresh,
  prefetchQuestionnaireLead,
  readCachedQuestionnaireDashboard,
} from "@/lib/questionnaire/client";
import { resolveQuestionnaireTargets } from "@/lib/questionnaire/rules";
import type { QuestionnaireDashboard } from "@/types/questionnaire";

function formatLeadTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-TW", {
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

function seedDashboardFromCache(): QuestionnaireDashboard | null {
  try {
    return readCachedQuestionnaireDashboard();
  } catch {
    return null;
  }
}

export default function QuestionnaireDashboardPage() {
  const router = useRouter();
  const dailyTarget = resolveQuestionnaireTargets().dailyValidNewLeads;
  const cached = seedDashboardFromCache();
  const [dashboard, setDashboard] = useState<QuestionnaireDashboard | null>(cached);
  const [coldLoading, setColdLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleHint, setStaleHint] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    const hasData = Boolean(readCachedQuestionnaireDashboard() ?? dashboard);

    // Fresh cache → skip network entirely
    if (!force && hasData && isQuestionnaireDashboardFresh()) {
      setColdLoading(false);
      setRefreshing(false);
      return;
    }

    if (hasData) {
      setRefreshing(true);
      setStaleHint(null);
    } else {
      setColdLoading(true);
    }
    setError(null);
    try {
      const data = await fetchQuestionnaireDashboard();
      setDashboard(data);
      setStaleHint(null);
    } catch (err) {
      if (hasData) {
        setStaleHint("更新失敗，顯示上次資料");
      } else {
        setError(err instanceof Error ? err.message : "載入失敗");
      }
    } finally {
      setColdLoading(false);
      setRefreshing(false);
    }
  }, [dashboard]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; TTL-aware SWR
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function copyLink() {
    if (!dashboard) return;
    const result = await copyTextToClipboard(dashboard.share.href);
    setToast(result.ok ? "已複製問卷連結" : "複製失敗，請手動選取");
  }

  async function shareLink() {
    if (!dashboard) return;
    const shareData = {
      title: QUESTIONNAIRE_PUBLIC_COPY.title,
      text: QUESTIONNAIRE_PUBLIC_COPY.shareText,
      url: dashboard.share.href,
    };
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // fall through to clipboard
    }
    await copyLink();
  }

  function startOnsite() {
    if (!dashboard) return;
    router.push(dashboard.share.onsiteHref);
  }

  function warmLead(leadId: string) {
    router.prefetch(`/questionnaire/leads/${leadId}`);
    prefetchQuestionnaireLead(leadId);
  }

  return (
    <TabRootShell
      header={
        <header className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[0.75rem] font-semibold tracking-[0.06em] text-[var(--brand-text-muted)]">
              Baki Go
            </p>
            {refreshing ? (
              <p className="text-[0.6875rem] text-[var(--brand-hint)]">更新中…</p>
            ) : null}
          </div>
          <h1 className="text-[1.625rem] font-semibold tracking-tight text-[var(--brand-text)]">
            問卷開發
          </h1>
          <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">
            每天完成 {dailyTarget} 份問卷
          </p>
        </header>
      }
    >
      {coldLoading && !dashboard ? (
        <div className="space-y-4 animate-pulse" aria-busy="true">
          <div className="h-28 rounded-[1.25rem] bg-[var(--brand-primary-muted)]" />
          <div className="h-12 rounded-[1rem] bg-[var(--brand-primary-muted)]" />
          <div className="h-20 rounded-[1.25rem] bg-[var(--brand-primary-muted)]" />
        </div>
      ) : null}

      {error && !dashboard ? (
        <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
      ) : null}

      {staleHint ? (
        <p className="mb-3 text-[0.75rem] text-[var(--brand-text-muted)]">{staleHint}</p>
      ) : null}

      {dashboard ? (
        <div className="space-y-5">
          <section className="space-y-3 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5">
            <p className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
              今日任務
            </p>
            <p className="text-[1.75rem] font-semibold tabular-nums text-[var(--brand-text)]">
              {dashboard.todayValidNewLeads} / {dashboard.todayTarget} 份
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--brand-primary-muted)]">
              <div
                className="h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-500"
                style={{ width: `${dashboard.todayProgressPercent}%` }}
              />
            </div>
            <p className="text-[0.9375rem] text-[var(--brand-text)]">
              🐟 今日問卷進魚池：+{dashboard.todayFishCredited}
            </p>
            <p className="text-[0.8125rem] text-[var(--brand-text-secondary)]">
              現場 {dashboard.todayOnsite} · 網路 {dashboard.todayOnline}
            </p>
          </section>

          {dashboard.todayValidNewLeads === 0 ? (
            <p className="text-[0.9375rem] text-[var(--brand-text-secondary)]">
              今天還沒有完成問卷
              <br />
              先從第一份開始吧。
            </p>
          ) : null}

          <button
            type="button"
            onClick={startOnsite}
            className="flex min-h-12 w-full items-center justify-center rounded-[1rem] bg-[var(--brand-primary)] px-4 text-[1rem] font-semibold text-white active:opacity-90"
          >
            ＋ 開始新問卷
          </button>

          <section className="space-y-3 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4">
            <p className="text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">
              我的專屬問卷
            </p>
            <p className="break-all text-[0.875rem] text-[var(--brand-text)]">{dashboard.share.display}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="flex min-h-11 flex-1 items-center justify-center rounded-[0.875rem] border border-[var(--brand-border)] text-[0.875rem] font-semibold"
              >
                📋 複製連結
              </button>
              <button
                type="button"
                onClick={() => void shareLink()}
                className="flex min-h-11 flex-1 items-center justify-center rounded-[0.875rem] border border-[var(--brand-border)] text-[0.875rem] font-semibold"
              >
                分享問卷
              </button>
            </div>
          </section>

          <Link
            href="/questionnaire/leads"
            onPointerEnter={() => router.prefetch("/questionnaire/leads")}
            onTouchStart={() => router.prefetch("/questionnaire/leads")}
            className="flex min-h-12 items-center justify-between rounded-[1rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] px-4 text-[0.9375rem] font-semibold text-[var(--brand-text)]"
          >
            <span>我的問卷名單 {dashboard.totalLeadCount} 人</span>
            <span aria-hidden>→</span>
          </Link>

          <section className="space-y-2 text-[0.875rem] text-[var(--brand-text-secondary)]">
            <p>本週有效新問卷：{dashboard.weekValidNewLeads}</p>
            <p>問卷 → 已進入邀約5步驟：{dashboard.invitationStartedCount}</p>
          </section>

          {dashboard.recentLeads.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
                最近
              </h2>
              <ul className="overflow-hidden rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)]">
                {dashboard.recentLeads.map((lead, index) => (
                  <li key={lead.id}>
                    <Link
                      href={`/questionnaire/leads/${lead.id}`}
                      onPointerEnter={() => warmLead(lead.id)}
                      onTouchStart={() => warmLead(lead.id)}
                      className={`block px-4 py-3 active:bg-[var(--brand-primary-muted)] ${
                        index > 0 ? "border-t border-[var(--brand-border)]/70" : ""
                      }`}
                    >
                      <p className="font-semibold text-[var(--brand-text)]">{lead.displayName}</p>
                      <p className="mt-0.5 text-[0.8125rem] text-[var(--brand-text-secondary)]">
                        主要需求：{lead.primaryNeed ?? "—"}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-[var(--brand-text-muted)]">
                        {QUESTIONNAIRE_SOURCE_LABEL[lead.lastSource]} ·{" "}
                        {formatLeadTime(lead.lastResponseAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {toast ? (
        <p className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--brand-text)] px-4 py-2 text-[0.8125rem] text-white shadow-lg">
          {toast}
        </p>
      ) : null}
    </TabRootShell>
  );
}
