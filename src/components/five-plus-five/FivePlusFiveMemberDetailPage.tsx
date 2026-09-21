"use client";

import { useCallback, useEffect, useState } from "react";
import { FivePlusFiveShell } from "@/components/five-plus-five/FivePlusFiveShell";
import { fetchFivePlusFiveMember } from "@/lib/five-plus-five/client";
import { formatShortDisplayDate } from "@/lib/five-plus-five/dates";
import { generationLabel } from "@/lib/five-plus-five/org-access";
import { dayStatusLabel } from "@/lib/five-plus-five/stats";
import type { FivePlusFiveMemberDetail } from "@/types/five-plus-five";

function formatTimeTaipei(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export default function FivePlusFiveMemberDetailPage({ memberId }: { memberId: string }) {
  const [detail, setDetail] = useState<FivePlusFiveMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchFivePlusFiveMember(memberId);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = detail?.stats;

  return (
    <FivePlusFiveShell title="5＋5 行動" subtitle="夥伴回報">
      {loading ? (
        <p className="text-[0.875rem] text-[var(--brand-text-muted)]">載入中…</p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
      ) : null}

      {detail && stats ? (
        <>
          <section className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5">
            <h2 className="text-[1.25rem] font-semibold text-[var(--brand-text)]">
              {detail.memberName}
            </h2>
            {detail.generation != null ? (
              <p className="mt-1 text-[0.875rem] text-[var(--brand-text-muted)]">
                {generationLabel(detail.generation)}
              </p>
            ) : null}
            {detail.readOnly ? (
              <p className="mt-2 text-[0.75rem] font-medium text-[var(--brand-text-secondary)]">
                唯讀 · 上線不可修改下線回報
              </p>
            ) : null}

            <div className="mt-5 space-y-4 text-[0.9375rem] text-[var(--brand-text)]">
              <div>
                <p className="text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">今日</p>
                <p className="mt-1">
                  🐟 {stats.today.fishPool}/{stats.today.fishTarget}
                </p>
                <p>🎯 +{stats.today.invitationFiveSteps}</p>
                <p className="mt-1 text-[0.8125rem] text-[var(--brand-text-secondary)]">
                  回報時間 {formatTimeTaipei(stats.today.firstSubmittedAt)} ·{" "}
                  {stats.today.submittedOnTime === true
                    ? "準時"
                    : stats.today.submittedOnTime === false
                      ? "補登"
                      : dayStatusLabel(stats.today.status)}
                </p>
              </div>
              <div>
                <p className="text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">本週</p>
                <p className="mt-1">
                  🐟 +{stats.week.fishPool}/{stats.week.fishTarget}
                </p>
                <p>
                  🎯 {stats.week.invitationFiveSteps}/{stats.week.invitationTarget}
                </p>
              </div>
              <div>
                <p className="text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">本月</p>
                <p className="mt-1">🐟 +{stats.month.fishPool}</p>
                <p>🎯 +{stats.month.invitationFiveSteps}</p>
              </div>
              <div>
                <p className="text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">歷史</p>
                <p className="mt-1">🐟 +{stats.history.fishPool.toLocaleString("en-US")}</p>
                <p>🎯 +{stats.history.invitationFiveSteps.toLocaleString("en-US")}</p>
              </div>
              <div className="border-t border-[var(--brand-border)]/70 pt-3">
                <p>準時回報率：{stats.monthOnTimeRatePercent}%</p>
                <p className="mt-1">連續準時：{stats.streakOnTimeDays}天</p>
              </div>
            </div>
          </section>

          <section className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5">
            <h3 className="text-[0.9375rem] font-semibold text-[var(--brand-text)]">
              最近30天每日紀錄
            </h3>
            <ul className="mt-3 divide-y divide-[var(--brand-border)]/70">
              {detail.recentDays.map((day) => (
                <li
                  key={day.date}
                  className="flex items-center justify-between gap-2 py-2.5 text-[0.8125rem] text-[var(--brand-text)]"
                >
                  <span className="w-12 tabular-nums">{formatShortDisplayDate(day.date)}</span>
                  <span className="tabular-nums">
                    {day.fishPoolCount != null ? `+${day.fishPoolCount}` : "—"}
                  </span>
                  <span className="tabular-nums">
                    {day.invitationFiveStepsCount != null
                      ? `+${day.invitationFiveStepsCount}`
                      : "—"}
                  </span>
                  <span className="min-w-[3rem] text-right text-[var(--brand-text-secondary)]">
                    {dayStatusLabel(day.status)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </FivePlusFiveShell>
  );
}
