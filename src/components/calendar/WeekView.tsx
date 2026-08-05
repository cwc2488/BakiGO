"use client";

import { getCalendarEventSurfaceStyle } from "@/lib/calendar/event-styles";
import { getWeekDates } from "@/lib/calendar/recurrence";
import { formatChineseWeekday, getTodayDateString } from "@/lib/calendar/time-grid";
import type { SwipeHandlers } from "@/lib/hooks/use-swipe-navigation";
import type { ExpandedCalendarEvent } from "@/types/calendar-event";

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
    <section className="overflow-x-auto rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)]">
      <div className="min-w-0 sm:min-w-[640px]">
        <div className="grid grid-cols-7 divide-x divide-[var(--cal-border)] touch-pan-y" {...swipeHandlers}>
          {weekDates.map((date) => {
            const isSelected = date === selectedDate;
            const isToday = date === today;

            return (
              <button
                key={date}
                className={`border-b border-[var(--cal-border)] px-2 py-3 text-center ${
                  isSelected
                    ? "bg-[var(--cal-primary)] text-white"
                    : isToday
                      ? "bg-[var(--cal-primary-light)] text-[var(--cal-primary-dark)]"
                      : "bg-[var(--cal-primary-muted)]"
                }`}
                onClick={() => onSelectDate(date)}
                type="button"
              >
                <p className="text-[0.6875rem]">{formatChineseWeekday(date).replace("週", "")}</p>
                <p className="text-[1rem] font-semibold">{Number(date.slice(8, 10))}</p>
              </button>
            );
          })}
        </div>

        {swipeHandlers ? (
          <p className="border-b border-[var(--cal-border)] py-1.5 text-center text-[0.6875rem] text-[var(--cal-hint)]">
            在此左右滑動切換週
          </p>
        ) : null}

        <div className="grid grid-cols-7 divide-x divide-[var(--cal-border)]">
          {weekDates.map((date) => {
            const dayEvents = grouped.get(date) ?? [];

            return (
              <div key={date} className="min-w-0">
                <div className="space-y-1.5 p-2">
                  {dayEvents.length > 0 ? (
                    dayEvents.map((event) => {
                      return (
                        <button
                          key={event.occurrenceId}
                          className="block w-full rounded-md px-2 py-1.5 text-left"
                          onClick={() => onEventSelect(event)}
                          style={getCalendarEventSurfaceStyle(event.color, {
                            attended: event.attendedFromShared,
                          })}
                          type="button"
                        >
                          <p className="truncate text-[0.6875rem] font-semibold">
                            {event.allDay ? "全天" : event.startAt.slice(11, 16)} {event.title}
                          </p>
                        </button>
                      );
                    })
                  ) : (
                    <p className="py-4 text-center text-[0.6875rem] text-[var(--cal-hint)]">—</p>
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
