"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CrmButton, CrmCard } from "@/components/members/ui";
import { PageShell } from "@/components/ui/PageShell";
import { formatCoachingCoachDailySummary } from "@/lib/coaching/coaching-completion";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { formatInterventionSuggestionLabel } from "@/lib/coaching/presentation/coaching-ui-copy";
import type { CoachingTodayStatus } from "@/types/coaching";

export default function CoachingDashboardPage() {
  const [rows, setRows] = useState<CoachingTodayStatus[]>([]);
  const [logDate, setLogDate] = useState(coachingTodayLogDate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchCoachingWithMemberAuth(`/api/coaching/dashboard?logDate=${encodeURIComponent(logDate)}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          rows?: CoachingTodayStatus[];
          error?: string;
        };
        if (!response.ok || !payload.ok || !payload.rows) {
          throw new Error(payload.error ?? "無法載入陪跑中心");
        }
        if (!cancelled) {
          setRows(payload.rows);
        }
      })
      .catch((loadError: Error) => {
        if (!cancelled) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [logDate]);

  return (
    <PageShell backHref="/" subtitle={`${logDate} · Asia/Taipei`} title="AI 陪跑">
      <CrmCard className="space-y-4">
        <p className="text-[0.9375rem] leading-relaxed text-[#636366]">
          今天進行中的陪跑客戶。點擊查看完整照片與文字回報。
        </p>

        {loading ? <p className="text-[0.9375rem] text-[#86868b]">載入中…</p> : null}
        {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}

        {!loading && !error && rows.length === 0 ? (
          <p className="text-[0.9375rem] text-[#86868b]">目前沒有進行中的陪跑客戶。</p>
        ) : null}

        <div className="space-y-3">
          {rows.map((row) => {
            const summaryLines = formatCoachingCoachDailySummary(row);
            return (
              <Link
                key={row.enrollmentId}
                className="block rounded-[1.25rem] border border-[#eef2ea] bg-[#fafdf8] px-4 py-4 transition-colors active:bg-[#f3f8ef]"
                href={`/coaching/${row.enrollmentId}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{row.customerDisplayName}</p>
                    {row.goal ? <p className="mt-1 text-[0.875rem] text-[#86868b]">{row.goal}</p> : null}
                  </div>
                  <span
                    className={`shrink-0 text-[0.8125rem] font-medium ${
                      row.isSubmitted ? "text-[var(--brand-primary-dark)]" : "text-[#86868b]"
                    }`}
                  >
                    {row.isSubmitted ? "已送出" : "尚未回報"}
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  {summaryLines.map((line) => (
                    <p key={line} className="text-[0.875rem] text-[#636366]">
                      {line}
                    </p>
                  ))}
                </div>
                {row.aiBrief && row.aiBrief.status === "completed" && row.aiBrief.dailySummary ? (
                  <div className="mt-3 border-t border-[#eef2ea] pt-3 text-[0.8125rem] leading-relaxed text-[#636366]">
                    <p className="line-clamp-2">{row.aiBrief.dailySummary}</p>
                    <p className="mt-1 text-[#86868b]">
                      建議：{formatInterventionSuggestionLabel(row.aiBrief.finalInterventionLevel)}
                      {row.aiBrief.coachAttentionRequired ? " · 需關心" : ""}
                    </p>
                  </div>
                ) : null}
                {row.aiBrief &&
                (row.aiBrief.status === "pending" || row.aiBrief.status === "processing") &&
                row.isSubmitted ? (
                  <p className="mt-3 text-[0.8125rem] text-[#86868b]">AI 摘要生成中…</p>
                ) : null}
              </Link>
            );
          })}
        </div>

        <CrmButton onClick={() => setLogDate(coachingTodayLogDate())} type="button" variant="secondary">
          重新整理今日
        </CrmButton>
      </CrmCard>
    </PageShell>
  );
}
