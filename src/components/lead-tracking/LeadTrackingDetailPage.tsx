"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type { LeadTracking, LeadTrackingHistory } from "@/lib/lead-tracking/types";
import { formatFollowUpLabel } from "@/lib/lead-tracking/list-utils";
import { LeadTrackingForm, leadToFormValues } from "@/components/lead-tracking/LeadTrackingForm";
import { APP_TIMEZONE } from "@/lib/config/app-config";

type Mode = "view" | "edit" | "complete";

function formatHistoryDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: APP_TIMEZONE,
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));
}

export default function LeadTrackingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = params.id;
  const [lead, setLead] = useState<LeadTracking | null>(null);
  const [history, setHistory] = useState<LeadTrackingHistory[]>([]);
  const [mode, setMode] = useState<Mode>("view");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completeStatus, setCompleteStatus] = useState("");
  const [completeDate, setCompleteDate] = useState("");
  const [completeTime, setCompleteTime] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithMemberAuth(`/api/lead-tracking/${leadId}`);
      if (res.status === 404) {
        setError("找不到名單");
        setLead(null);
        return;
      }
      if (!res.ok) {
        throw new Error("載入失敗");
      }
      const data = (await res.json()) as {
        lead: LeadTracking;
        history: LeadTrackingHistory[];
      };
      setLead(data.lead);
      setHistory(data.history);
      setCompleteStatus(data.lead.currentStatus ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function onDelete() {
    if (!lead) return;
    if (!window.confirm(`確定刪除「${lead.name}」？此操作無法復原。`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithMemberAuth(`/api/lead-tracking/${lead.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("刪除失敗");
      }
      router.replace("/lead-tracking");
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
      setBusy(false);
    }
  }

  async function onCompleteFollowUp() {
    if (!lead) return;
    setBusy(true);
    setError(null);
    try {
      let nextFollowUpAt: string | null = null;
      if (completeDate.trim()) {
        const t = (completeTime.trim() || "09:00").slice(0, 5);
        nextFollowUpAt = `${completeDate}T${t}:00+08:00`;
      }
      const res = await fetchWithMemberAuth(`/api/lead-tracking/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          completeFollowUp: true,
          currentStatus: completeStatus.trim() || null,
          nextFollowUpAt,
          reminderEnabled: Boolean(lead.reminderEnabled && nextFollowUpAt),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "更新失敗");
      }
      const data = (await res.json()) as {
        lead: LeadTracking;
        history: LeadTrackingHistory[];
      };
      setLead(data.lead);
      setHistory(data.history);
      setMode("view");
      setCompleteDate("");
      setCompleteTime("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageShell backHref="/lead-tracking" backLabel="返回名單" title="名單詳情" variant="plain">
        <div className="h-40 animate-pulse rounded-2xl bg-[var(--brand-border)]/60" />
      </PageShell>
    );
  }

  if (!lead) {
    return (
      <PageShell backHref="/lead-tracking" backLabel="返回名單" title="名單詳情" variant="plain">
        <p className="text-center text-[0.875rem] text-[#b42318]">{error ?? "找不到名單"}</p>
      </PageShell>
    );
  }

  if (mode === "edit") {
    return (
      <PageShell backHref={`/lead-tracking/${lead.id}`} backLabel="返回詳情" title="編輯名單" variant="plain">
        <LeadTrackingForm
          initial={leadToFormValues(lead)}
          leadId={lead.id}
          mode="edit"
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      backHref="/lead-tracking"
      backLabel="返回名單"
      headerExtra={
        <button
          className="text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]"
          onClick={() => setMode("edit")}
          type="button"
        >
          編輯
        </button>
      }
      subtitle={formatFollowUpLabel(lead.nextFollowUpAt)}
      title={lead.name}
      variant="plain"
    >
      <section className="space-y-3 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] px-4 py-4">
        {lead.currentStatus ? (
          <div>
            <p className="text-[0.75rem] font-semibold text-[var(--brand-text-muted)]">目前狀況</p>
            <p className="mt-1 whitespace-pre-wrap text-[0.9375rem] text-[var(--brand-text)]">
              {lead.currentStatus}
            </p>
          </div>
        ) : null}
        {lead.phone ? (
          <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">電話：{lead.phone}</p>
        ) : null}
        {lead.contactChannel ? (
          <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">
            聯絡：{lead.contactChannel}
          </p>
        ) : null}
        {lead.notes ? (
          <div>
            <p className="text-[0.75rem] font-semibold text-[var(--brand-text-muted)]">備註</p>
            <p className="mt-1 whitespace-pre-wrap text-[0.875rem] text-[var(--brand-text-secondary)]">
              {lead.notes}
            </p>
          </div>
        ) : null}
        <p className="text-[0.8125rem] text-[var(--brand-text-muted)]">
          提醒：{lead.reminderEnabled && lead.nextFollowUpAt ? "開啟" : "關閉"}
        </p>
      </section>

      {mode === "complete" ? (
        <section className="space-y-3 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] px-4 py-4">
          <p className="text-[0.9375rem] font-semibold text-[var(--brand-text)]">完成這次追蹤</p>
          <label className="block text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">
            更新目前狀況
            <textarea
              className="mt-1.5 min-h-[4.5rem] w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
              onChange={(e) => setCompleteStatus(e.target.value)}
              value={completeStatus}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">
              下次日期（可清空）
              <input
                className="mt-1.5 w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5"
                onChange={(e) => setCompleteDate(e.target.value)}
                type="date"
                value={completeDate}
              />
            </label>
            <label className="block text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">
              時間
              <input
                className="mt-1.5 w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5"
                onChange={(e) => setCompleteTime(e.target.value)}
                type="time"
                value={completeTime}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void onCompleteFollowUp()}
              type="button"
            >
              確認
            </button>
            <button
              className="rounded-2xl border border-[var(--brand-border)] px-4 py-3 text-[0.9375rem] font-semibold"
              onClick={() => setMode("view")}
              type="button"
            >
              取消
            </button>
          </div>
        </section>
      ) : (
        <button
          className="w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3.5 text-[1rem] font-semibold text-white"
          onClick={() => setMode("complete")}
          type="button"
        >
          完成這次追蹤
        </button>
      )}

      {history.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-muted)]">
            追蹤紀錄
          </h2>
          <ul className="space-y-2">
            {history.map((item) => (
              <li
                key={item.id}
                className="flex gap-3 border-b border-[var(--brand-border)]/60 py-2 last:border-b-0"
              >
                <span className="w-10 shrink-0 text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">
                  {formatHistoryDate(item.createdAt)}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap text-[0.875rem] text-[var(--brand-text)]">
                  {item.statusText}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="text-[0.8125rem] text-[#b42318]">{error}</p> : null}

      <div className="flex items-center justify-between gap-3 pt-2">
        <Link
          className="text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]"
          href="/profile#notifications"
        >
          推播設定
        </Link>
        <button
          className="text-[0.875rem] font-semibold text-[#b42318] disabled:opacity-50"
          disabled={busy}
          onClick={() => void onDelete()}
          type="button"
        >
          刪除名單
        </button>
      </div>
    </PageShell>
  );
}
