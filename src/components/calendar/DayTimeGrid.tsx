"use client";

import {
  formatTimeLabel,
  getGridHeightPx,
  getSlotCount,
  getSlotHeightPx,
  layoutTimedEvents,
  slotIndexToTime,
  formatEventTimeRange,
} from "@/lib/calendar/time-grid";
import { getCalendarEventSurfaceStyle } from "@/lib/calendar/event-styles";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  type CalendarSlotInterval,
  type ExpandedCalendarEvent,
} from "@/types/calendar-event";

function CurrentTimeIndicator({
  dayDate,
  intervalMinutes,
}: {
  dayDate: string;
  intervalMinutes: CalendarSlotInterval;
}) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (today !== dayDate) {
    return null;
  }

  const minutes = now.getHours() * 60 + now.getMinutes() - CALENDAR_DAY_START_HOUR * 60;
  if (minutes < 0 || minutes > (CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) * 60) {
    return null;
  }

  const topPx = (minutes / intervalMinutes) * getSlotHeightPx(intervalMinutes);

  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: topPx }}>
      <div className="relative">
        <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-[var(--cal-primary)]" />
        <div className="h-px bg-[var(--cal-primary)]" />
      </div>
    </div>
  );
}

export function DayTimeGrid({
  dayDate,
  events,
  intervalMinutes,
  onSlotSelect,
  onEventSelect,
}: {
  dayDate: string;
  events: ExpandedCalendarEvent[];
  intervalMinutes: CalendarSlotInterval;
  onSlotSelect: (startAt: string) => void;
  onEventSelect: (event: ExpandedCalendarEvent) => void;
}) {
  const slotCount = getSlotCount(intervalMinutes);
  const slotHeight = getSlotHeightPx(intervalMinutes);
  const gridHeight = getGridHeightPx(intervalMinutes);
  const timedEvents = events.filter((event) => !event.allDay);
  const allDayEvents = events.filter((event) => event.allDay);
  const timedLayouts = layoutTimedEvents(timedEvents, dayDate, intervalMinutes);

  const slots = Array.from({ length: slotCount }, (_, index) => {
    const totalMinutes = CALENDAR_DAY_START_HOUR * 60 + index * intervalMinutes;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return { index, hour, minute, label: minute === 0 ? formatTimeLabel(hour, 0) : "" };
  });

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)]">
      {allDayEvents.length > 0 ? (
        <div className="border-b border-[var(--cal-border)] px-4 py-3">
          <p className="text-[0.75rem] font-medium text-[var(--cal-text-muted)]">全天</p>
          <div className="mt-2 space-y-1.5">
            {allDayEvents.map((event) => {
              return (
                <button
                  key={event.occurrenceId}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[0.8125rem] font-medium"
                  onClick={() => onEventSelect(event)}
                  style={getCalendarEventSurfaceStyle(event.color, {
                    attended: event.attendedFromShared,
                  })}
                  type="button"
                >
                  {event.title}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex">
        <div className="w-14 shrink-0 border-r border-[var(--cal-border)] bg-[var(--cal-primary-muted)]" style={{ height: gridHeight }}>
          {slots.map((slot) => (
            <div
              key={slot.index}
              className="relative border-b border-[#eef2ee] pr-2 text-right text-[0.6875rem] text-[var(--cal-text-muted)]"
              style={{ height: slotHeight }}
            >
              {slot.label ? (
                <span className="absolute -top-2 right-2 bg-[var(--cal-primary-muted)] px-0.5">{slot.label}</span>
              ) : null}
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height: gridHeight }}>
          {slots.map((slot) => (
            <button
              key={slot.index}
              className="block w-full border-b border-[#eef2ee] hover:bg-[var(--cal-primary-muted)]"
              onClick={() => onSlotSelect(slotIndexToTime(dayDate, slot.index, intervalMinutes))}
              style={{ height: slotHeight }}
              type="button"
            />
          ))}

          <CurrentTimeIndicator dayDate={dayDate} intervalMinutes={intervalMinutes} />

          {timedLayouts.map((layout) => {
            const insetPx = 4;
            const gapPx = 2;
            const totalColumns = Math.round(100 / layout.widthPercent);
            const columnIndex = Math.round(layout.leftPercent / layout.widthPercent);
            const trackWidth = `(100% - ${insetPx * 2}px - ${Math.max(0, totalColumns - 1) * gapPx}px)`;
            return (
              <button
                key={layout.event.occurrenceId}
                className="absolute box-border overflow-hidden rounded-[4px] px-1.5 py-1 text-left"
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  onEventSelect(layout.event);
                }}
                style={{
                  top: layout.topPx,
                  height: layout.heightPx,
                  left: `calc(${insetPx}px + ${trackWidth} * ${columnIndex / totalColumns} + ${columnIndex * gapPx}px)`,
                  width: `calc(${trackWidth} * ${layout.widthPercent / 100})`,
                  zIndex: 10 + columnIndex,
                  ...getCalendarEventSurfaceStyle(layout.event.color, {
                    attended: layout.event.attendedFromShared,
                  }),
                }}
                type="button"
              >
                <p className="truncate text-[0.75rem] font-semibold leading-tight">{layout.event.title}</p>
                {layout.heightPx >= 36 ? (
                  <p className="truncate text-[0.625rem] leading-tight text-[#636366]">
                    {formatEventTimeRange(layout.event.startAt, layout.event.endAt, layout.event.allDay)}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
