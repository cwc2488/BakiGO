"use client";

import type { CoachingRecentDaySummary } from "@/lib/coaching/coaching-day-status";
import { CrmButton, CrmCard } from "@/components/members/ui";

export function CoachingCustomerHistoryView({
  days,
  onSelectDay,
  onBackToToday,
}: {
  days: CoachingRecentDaySummary[];
  onSelectDay: (logDate: string) => void;
  onBackToToday: () => void;
}) {
  return (
    <div className="space-y-4">
      <CrmCard className="space-y-2">
        <h2 className="text-[1.375rem] font-semibold text-[#1d1d1f]">陪跑紀錄</h2>
        <p className="text-[0.9375rem] text-[#636366]">
          看看這幾天的回報與教練焦點。點一天就能打開當日詳情。
        </p>
      </CrmCard>

      <div className="space-y-3">
        {days.map((day) => (
          <button
            key={day.logDate}
            type="button"
            onClick={() => onSelectDay(day.logDate)}
            className="w-full rounded-[1.25rem] border border-[#e5e5ea] bg-white px-4 py-4 text-left transition active:bg-[#fafafa]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[0.8125rem] font-medium text-[#86868b]">
                  {day.dayNumber != null ? `Day ${day.dayNumber} / 90` : day.relativeLabel}
                  {" · "}
                  {day.shortDate}
                </p>
                <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{day.relativeLabel}</p>
                <p className="text-[0.875rem] text-[#636366]">
                  {day.hasLog ? (day.submittedAt ? "已回報" : "草稿") : "尚未回報"}
                  {" · "}
                  {day.statusLabel}
                </p>
                {day.nutritionLabel ? (
                  <p className="text-[0.875rem] text-[#636366]">飲食方向：{day.nutritionLabel}</p>
                ) : null}
                {day.focusSummary ? (
                  <p className="text-[0.875rem] text-[#1d1d1f]">焦點：{day.focusSummary}</p>
                ) : null}
              </div>
              <span className="text-[0.875rem] text-[var(--brand-primary-dark)]">查看</span>
            </div>
          </button>
        ))}
      </div>

      <CrmButton onClick={onBackToToday} type="button" variant="secondary">
        回到今日回報
      </CrmButton>
    </div>
  );
}
