"use client";

import { getCalendarEventSurfaceStyle } from "@/lib/calendar/event-styles";
import { getWeekDates } from "@/lib/calendar/recurrence";
import { formatChineseWeekday, getTodayDateString } from "@/lib/calendar/time-grid";
import type { SwipeHandlers } from "@/lib/hooks/use-swipe-navigation";
import type { ExpandedCalendarEvent } from "@/types/calendar-event";

const MAX_VISIBLE_EVENTS = 4;

function groupEventsByDay(events: ExpandedCalendarEvent[]): Map<string, ExpandedCalendarEvent[]> {
  const map = new Map<string, ExpandedCalendarEvent[]>();
  for (const event of events) {
    const day = event.startAt.slice(0, 10);
    const list = map.get(day) ?? [];
    list.push(event);
    map.set(day, list);
  }
  for (const [day, list] of map) {
    map.set(
      day,
      list.sort((left, right) => left.startAt.localeCompare(right.startAt)),
    );
  }
  return map;
}

export function WeekView({
  anchorDate,
  selectedDate,
  events,
  onSelectDate,
  onEventSelect,
  swipeHandlers,
}: {
  anchorDate: string;
  selectedDate: string;
  events: ExpandedCalendarEvent[];
  onSelectDate: (date: string) => void;
  onEventSelect: (event: ExpandedCalendarEvent) => void;
  swipeHandlers?: SwipeHandlers;
}) {
  const weekDates = getWeekDates(anchorDate);
  const grouped = groupEventsByDay(events);
  const today = getTodayDateString();

  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)]">
      <div className="min-w-0">
        <div className="grid grid-cols-7 divide-x divide-[var(--cal-border)] touch-pan-y" {...swipeHandlers}>
          {weekDates.map((date) => {
            const isSelected = date === selectedDate;
            const isToday = date === today;
            const dayEvents = grouped.get(date) ?? [];

            return (
              <button
                key={date}
                className={`border-b border-[var(--cal-border)] px-1 py-2 text-center ${
                  isSelected
                    ? "bg-[var(--cal-primary)] text-white"
                    : isToday
                      ? "bg-[var(--cal-primary-light)] text-[var(--cal-primary-dark)]"
                      : "bg-[var(--cal-primary-muted)]"
                }`}
                onClick={() => onSelectDate(date)}
                type="button"
              >
                <p className="text-[0.625rem] leading-none">{formatChineseWeekday(date).replace("週", "")}</p>
                <p className="mt-0.5 text-[0.875rem] font-semibold leading-none">
                  {Number(date.slice(8, 10))}
                </p>
                {dayEvents.length > 0 ? (
                  <p
                    className={`mt-1 text-[0.5625rem] font-medium ${
                      isSelected ? "text-white/90" : "text-[var(--cal-primary-dark)]"
                    }`}
                  >
                    {dayEvents.length} 項
                  </p>
                ) : (
                  <span className="mt-1 block h-3" />
                )}
              </button>
            );
          })}
        </div>

        {swipeHandlers ? (
          <p className="border-b border-[var(--cal-border)] py-1 text-center text-[0.625rem] text-[var(--cal-hint)]">
            左右滑動切換週
          </p>
        ) : null}

        <div className="grid grid-cols-7 divide-x divide-[var(--cal-border)]">
          {weekDates.map((date) => {
            const dayEvents = grouped.get(date) ?? [];
            const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
            const hiddenCount = dayEvents.length - visibleEvents.length;

            return (
              <div key={date} className="flex min-h-[7.5rem] min-w-0 flex-col">
                <div className="flex flex-1 flex-col gap-1 p-1">
                  {visibleEvents.length > 0 ? (
                    <>
                      {visibleEvents.map((event) => (
                        <button
                          key={event.occurrenceId}
                          className="block w-full rounded px-1 py-1 text-left"
                          onClick={() => onEventSelect(event)}
                          style={getCalendarEventSurfaceStyle(event.color, {
                            attended: event.attendedFromShared,
                          })}
                          type="button"
                        >
                          <p className="truncate text-[0.5625rem] font-semibold leading-tight">
                            {event.allDay ? "全天" : event.startAt.slice(11, 16)}
                          </p>
                          <p className="truncate text-[0.5625rem] leading-tight opacity-90">
                            {event.title}
                          </p>
                        </button>
                      ))}
                      {hiddenCount > 0 ? (
                        <p className="px-1 text-center text-[0.5625rem] font-medium text-[#86868b]">
                          +{hiddenCount}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="flex flex-1 items-center justify-center text-[0.5625rem] text-[var(--cal-hint)]">
                      —
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
