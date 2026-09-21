"use client";

import { useCallback, useEffect, useState } from "react";
import { FivePlusFiveShell } from "@/components/five-plus-five/FivePlusFiveShell";
import { NumberStepper } from "@/components/five-plus-five/NumberStepper";
import { copyTextToClipboard } from "@/lib/five-plus-five/clipboard";
import { formatPersonalWarReport } from "@/lib/five-plus-five/copy-report";
import {
  backfillFivePlusFive,
  fetchMyFivePlusFive,
  upsertMyFivePlusFive,
} from "@/lib/five-plus-five/client";
import { formatShortDisplayDate, addCalendarDays } from "@/lib/five-plus-five/dates";
import { dayStatusLabel } from "@/lib/five-plus-five/stats";
import type { FivePlusFiveMyStats } from "@/types/five-plus-five";

export default function FivePlusFiveMyReportPage() {
  const [stats, setStats] = useState<FivePlusFiveMyStats | null>(null);
  const [fish, setFish] = useState(0);
  const [invite, setInvite] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillDate, setBackfillDate] = useState("");
  const [backfillFish, setBackfillFish] = useState(0);
  const [backfillInvite, setBackfillInvite] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchMyFivePlusFive();
      setStats(result.stats);
      setFish(result.todayReport?.fishPoolCount ?? 0);
      setInvite(result.todayReport?.invitationFiveStepsCount ?? 0);
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

  async function submitToday() {
    setSaving(true);
    setError(null);
    try {
      const result = await upsertMyFivePlusFive({
        fishPoolCount: fish,
        invitationFiveStepsCount: invite,
      });
      setStats(result.stats);
      setToast("已完成今日回報");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function submitBackfill() {
    if (!backfillDate) {
      setError("請選擇補登日期");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await backfillFivePlusFive({
        reportDate: backfillDate,
        fishPoolCount: backfillFish,
        invitationFiveStepsCount: backfillInvite,
      });
      setStats(result.stats);
      setBackfillOpen(false);
      setToast("補登完成");
    } catch (err) {
      setError(err instanceof Error ? err.message : "補登失敗");
    } finally {
      setSaving(false);
    }
  }

  async function copyReport() {
    if (!stats) return;
    const text = formatPersonalWarReport(stats);
    const result = await copyTextToClipboard(text);
    setToast(result.ok ? "已複製，可以直接貼到群組" : "複製失敗，請手動選取文字");
  }

  const hasReport = Boolean(stats?.today.hasReport);
  const subtitle = stats ? formatShortDisplayDate(stats.todayDate) : undefined;

  return (
    <FivePlusFiveShell subtitle={subtitle}>
      {loading ? (
        <p className="text-[0.875rem] text-[var(--brand-text-muted)]">載入中…</p>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
      ) : null}

      {!loading && stats ? (
        <>
          <section className="space-y-3">
            <NumberStepper label="🐟 今日魚池新增" value={fish} onChange={setFish} />
            <NumberStepper label="🎯 今日進入邀約5步驟" value={invite} onChange={setInvite} />
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitToday()}
              className="flex min-h-12 w-full items-center justify-center rounded-[1rem] bg-[var(--brand-primary)] px-4 text-[1rem] font-semibold text-white active:opacity-90 disabled:opacity-50"
            >
              {saving ? "儲存中…" : hasReport ? "更新今日回報" : "完成今日回報"}
            </button>
            <button
              type="button"
              onClick={() => setBackfillOpen((v) => !v)}
              className="w-full text-center text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]"
            >
              補登紀錄
            </button>
          </section>

          {backfillOpen ? (
            <section className="space-y-3 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4">
              <p className="text-[0.875rem] font-semibold text-[var(--brand-text)]">補登過去日期</p>
              <p className="text-[0.75rem] text-[var(--brand-text-muted)]">
                補登會計入週／月／歷史，但不會修復連續準時回報。
              </p>
              <input
                type="date"
                value={backfillDate}
                max={addCalendarDays(stats.todayDate, -1)}
                onChange={(e) => setBackfillDate(e.target.value)}
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
              />
              <NumberStepper label="🐟 魚池" value={backfillFish} onChange={setBackfillFish} />
              <NumberStepper
                label="🎯 邀約5步驟"
                value={backfillInvite}
                onChange={setBackfillInvite}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitBackfill()}
                className="flex min-h-11 w-full items-center justify-center rounded-[0.875rem] border border-[var(--brand-border)] text-[0.9375rem] font-semibold"
              >
                送出補登
              </button>
            </section>
          ) : null}

          <section className="space-y-4 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5">
            <div>
              <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
                今日
              </h2>
              <p className="mt-2 text-[0.9375rem] font-medium text-[var(--brand-text)]">
                {dayStatusLabel(stats.today.status)}
              </p>
              <p className="mt-3 text-[0.9375rem] text-[var(--brand-text)]">
                🐟 魚池 {stats.today.fishPool} / {stats.today.fishTarget}
              </p>
              <p className="text-[0.9375rem] text-[var(--brand-text)]">
                🎯 邀約5步驟 +{stats.today.invitationFiveSteps}
              </p>
            </div>
            <div>
              <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
                本週
              </h2>
              <p className="mt-2 text-[0.9375rem] text-[var(--brand-text)]">
                🐟 魚池 {stats.week.fishPool} / {stats.week.fishTarget}
              </p>
              <p className="text-[0.9375rem] text-[var(--brand-text)]">
                🎯 邀約5步驟 {stats.week.invitationFiveSteps} / {stats.week.invitationTarget}
                {stats.week.invitationMet ? " · 本週達標" : ""}
              </p>
            </div>
            <div>
              <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
                本月
              </h2>
              <p className="mt-2 text-[0.9375rem] text-[var(--brand-text)]">
                🐟 魚池 +{stats.month.fishPool.toLocaleString("en-US")}
              </p>
              <p className="text-[0.9375rem] text-[var(--brand-text)]">
                🎯 邀約5步驟 +{stats.month.invitationFiveSteps.toLocaleString("en-US")}
              </p>
            </div>
            <div>
              <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
                歷史
              </h2>
              <p className="mt-2 text-[0.9375rem] text-[var(--brand-text)]">
                🐟 魚池 +{stats.history.fishPool.toLocaleString("en-US")}
              </p>
              <p className="text-[0.9375rem] text-[var(--brand-text)]">
                🎯 邀約5步驟 +{stats.history.invitationFiveSteps.toLocaleString("en-US")}
              </p>
            </div>
            <div className="border-t border-[var(--brand-border)]/70 pt-4 text-[0.9375rem] text-[var(--brand-text)]">
              <p>🔥 連續準時回報：{stats.streakOnTimeDays} 天</p>
              <p className="mt-1">📈 本月準時回報率：{stats.monthOnTimeRatePercent}%</p>
            </div>
          </section>

          <button
            type="button"
            onClick={() => void copyReport()}
            className="flex min-h-12 w-full items-center justify-center rounded-[1rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[0.9375rem] font-semibold text-[var(--brand-text)]"
          >
            📋 複製今日戰報
          </button>
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
