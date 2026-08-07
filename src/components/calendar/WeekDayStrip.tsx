"use client";

import type { SwipeHandlers } from "@/lib/hooks/use-swipe-navigation";

export interface WeekDayStripItem {
  value: string;
  weekday: string;
  day: number;
  isSelected: boolean;
  isToday: boolean;
}

export function WeekDayStrip({
  days,
  onSelectDate,
  onShiftWeek,
  weekLabel,
  swipeHandlers,
}: {
  days: WeekDayStripItem[];
  onSelectDate: (date: string) => void;
  onShiftWeek?: (delta: number) => void;
  weekLabel?: string;
  swipeHandlers?: SwipeHandlers;
}) {
  return (
    <div className="space-y-2">
      {weekLabel || onShiftWeek ? (
        <div className="flex items-center gap-2">
          {onShiftWeek ? (
            <button
              aria-label="上一週"
              className="rounded-lg border border-[var(--cal-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-[0.8125rem] font-medium text-[#636366]"
              onClick={() => onShiftWeek(-1)}
              type="button"
            >
              ‹
            </button>
          ) : (
            <span className="w-10" />
          )}
          {weekLabel ? (
            <p className="flex-1 text-center text-[0.8125rem] font-semibold text-[#636366]">
              {weekLabel}
            </p>
          ) : (
            <span className="flex-1" />
          )}
          {onShiftWeek ? (
            <button
              aria-label="下一週"
              className="rounded-lg border border-[var(--cal-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-[0.8125rem] font-medium text-[#636366]"
              onClick={() => onShiftWeek(1)}
              type="button"
            >
              ›
            </button>
          ) : (
            <span className="w-10" />
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-7 gap-1 touch-pan-y" {...swipeHandlers}>
        {days.map((day) => (
          <button
            key={day.value}
            className={`rounded-xl px-1 py-2 text-center ${
              day.isSelected
                ? "bg-[var(--cal-primary)] text-white"
                : day.isToday
                  ? "bg-[var(--cal-primary-light)] text-[var(--cal-primary-dark)]"
                  : "bg-[var(--cal-surface)] text-[var(--cal-text-secondary)]"
            }`}
            onClick={() => onSelectDate(day.value)}
            type="button"
          >
            <p className="text-[0.6875rem]">{day.weekday}</p>
            <p className="text-[0.9375rem] font-semibold">{day.day}</p>
          </button>
        ))}
      </div>
      {swipeHandlers ? (
        <p className="text-center text-[0.6875rem] text-[var(--cal-hint)]">在此左右滑動切換週</p>
      ) : null}
    </div>
  );
}
