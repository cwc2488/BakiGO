"use client";

import { getCalendarEventSurfaceStyle } from "@/lib/calendar/event-styles";
import { formatChineseMonthDay, formatChineseWeekday } from "@/lib/calendar/time-grid";
import type { ExpandedCalendarEvent } from "@/types/calendar-event";

export function MonthDayAgenda({
  date,
  events,
  onEventSelect,
}: {
  date: string;
  events: ExpandedCalendarEvent[];
  onEventSelect: (event: ExpandedCalendarEvent) => void;
}) {
  const dayEvents = events
    .filter((event) => event.startAt.slice(0, 10) === date)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));

  return (
    <section className="rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] p-4">
      <h3 className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
        {formatChineseMonthDay(date)} {formatChineseWeekday(date)}
        <span className="ml-2 text-[0.8125rem] font-normal text-[#86868b]">
          {dayEvents.length} 項行程
        </span>
      </h3>

      {dayEvents.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {dayEvents.map((event) => (
            <li key={event.occurrenceId}>
              <button
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--cal-primary-muted)]"
                onClick={() => onEventSelect(event)}
                style={getCalendarEventSurfaceStyle(event.color, {
                  attended: event.attendedFromShared,
                })}
                type="button"
              >
                <span className="shrink-0 pt-0.5 text-[0.75rem] font-semibold tabular-nums">
                  {event.allDay ? "全天" : event.startAt.slice(11, 16)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-semibold">{event.title}</span>
                  {event.notes ? (
                    <span className="mt-0.5 block truncate text-[0.75rem] opacity-80">{event.notes}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 py-2 text-[0.8125rem] text-[#86868b]">這天沒有行程</p>
      )}
    </section>
  );
}
