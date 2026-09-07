"use client";

import { getCalendarEventDotColor } from "@/lib/calendar/event-styles";
import { getMonthGridDates } from "@/lib/calendar/recurrence";
import {
  getCalendarWeekdayLabels,
  type CalendarWeekStart,
} from "@/lib/calendar/calendar-week-start-preferences";
import { formatChineseYearMonth, getTodayDateString } from "@/lib/calendar/time-grid";
import type { SwipeHandlers } from "@/lib/hooks/use-swipe-navigation";
import type { ExpandedCalendarEvent } from "@/types/calendar-event";
import { shiftMonth } from "@/lib/calendar/calendar-stats";

function countEventsByDay(events: ExpandedCalendarEvent[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const event of events) {
    const day = event.startAt.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return map;
}

function primaryColorForDay(
  day: string,
  events: ExpandedCalendarEvent[],
): ExpandedCalendarEvent["color"] | null {
  const dayEvents = events.filter((event) => event.startAt.slice(0, 10) === day);
  return dayEvents[0]?.color ?? null;
}

export function MonthView({
  anchorDate,
  selectedDate,
  events,
  onSelectDate,
  onShiftMonth,
  swipeHandlers,
  weekStart = "monday",
  weekStartsOn = 1,
}: {
  anchorDate: string;
  selectedDate: string;
  events: ExpandedCalendarEvent[];
  onSelectDate: (date: string) => void;
  onShiftMonth: (nextAnchor: string) => void;
  swipeHandlers?: SwipeHandlers;
  weekStart?: CalendarWeekStart;
  weekStartsOn?: 0 | 1;
}) {
  const gridDates = getMonthGridDates(anchorDate, weekStartsOn);
  const weekdayLabels = getCalendarWeekdayLabels(weekStart);
  const currentMonth = anchorDate.slice(0, 7);
  const counts = countEventsByDay(events);
  const today = getTodayDateString();

  return (
    <section className="rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] p-4">
      <div
        className="mb-4 flex items-center justify-between touch-pan-y"
        {...swipeHandlers}
      >
        <button
          className="rounded-lg px-2 py-1 text-[0.9375rem] text-[#636366]"
          onClick={() => onShiftMonth(shiftMonth(anchorDate, -1))}
          type="button"
        >
          ‹
        </button>
        <p className="text-[1rem] font-semibold text-[#1d1d1f]">
          {formatChineseYearMonth(anchorDate)}
        </p>
        <button
          className="rounded-lg px-2 py-1 text-[0.9375rem] text-[#636366]"
          onClick={() => onShiftMonth(shiftMonth(anchorDate, 1))}
          type="button"
        >
          ›
        </button>
      </div>
      <p className="mb-3 text-center text-[0.6875rem] text-[var(--cal-hint)]">左右滑動切換月份</p>

      <div className="mb-2 grid grid-cols-7 text-center text-[0.6875rem] font-medium text-[var(--cal-text-muted)]">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {gridDates.map((date) => {
          const inMonth = date.slice(0, 7) === currentMonth;
          const count = counts.get(date) ?? 0;
          const color = primaryColorForDay(date, events);
          const isSelected = date === selectedDate;
          const isToday = date === today;

          return (
            <button
              key={date}
              className={`flex min-h-[2.75rem] flex-col items-center rounded-lg px-0.5 py-1 ${
                isSelected
                  ? "bg-[var(--cal-primary)] text-white"
                  : isToday
                    ? "bg-[var(--cal-primary-light)] text-[var(--cal-primary-dark)]"
                    : inMonth
                      ? "bg-[var(--cal-primary-muted)] text-[var(--cal-text)]"
                      : "bg-transparent text-[var(--cal-hint)]"
              }`}
              onClick={() => onSelectDate(date)}
              type="button"
            >
              <span className="text-[0.8125rem] font-semibold">{Number(date.slice(8, 10))}</span>
              {count > 0 && color ? (
                <span className="mt-1 flex items-center gap-0.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: isSelected ? "#ffffff" : getCalendarEventDotColor(color),
                    }}
                  />
                  {!isSelected && count > 1 ? (
                    <span className="text-[0.625rem] text-[#86868b]">{count}</span>
                  ) : null}
                </span>
              ) : (
                <span className="mt-1 h-1.5" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
