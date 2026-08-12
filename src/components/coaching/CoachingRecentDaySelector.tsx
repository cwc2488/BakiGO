"use client";

import type { CoachingRecentDaySummary } from "@/lib/coaching/coaching-day-status";

export function CoachingRecentDaySelector({
  days,
  selectedLogDate,
  onSelect,
}: {
  days: CoachingRecentDaySummary[];
  selectedLogDate: string;
  onSelect: (logDate: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="最近三天回報">
      {days.map((day) => {
        const selected = day.logDate === selectedLogDate;
        return (
          <button
            key={day.logDate}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(day.logDate)}
            className={[
              "min-w-[5.5rem] flex-1 rounded-[0.875rem] border px-3 py-2 text-left transition",
              selected
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
                : "border-[#e5e5ea] bg-white",
            ].join(" ")}
          >
            <p className="text-[0.8125rem] font-semibold text-[#1d1d1f]">{day.relativeLabel}</p>
            <p className="text-[0.6875rem] text-[#86868b]">{day.shortDate}</p>
            <p
              className={[
                "mt-1 text-[0.6875rem] font-medium",
                day.status === "ai_ready"
                  ? "text-[var(--brand-primary-dark)]"
                  : day.status === "ai_unavailable"
                    ? "text-[#cf1322]"
                    : "text-[#636366]",
              ].join(" ")}
            >
              {day.statusLabel}
            </p>
          </button>
        );
      })}
    </div>
  );
}
