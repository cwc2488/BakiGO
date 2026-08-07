"use client";

import { canDragCalendarEvent } from "@/lib/calendar/can-drag-calendar-event";
import {
  clampDragTopPx,
  eventDurationMinutes,
  formatChineseMonthDay,
  formatChineseWeekday,
  formatEventTimeRange,
  formatTimeLabel,
  getGridHeightPx,
  getSlotCount,
  getSlotHeightPx,
  layoutTimedEvents,
  rescheduleTimesFromGridTop,
  slotIndexToTime,
} from "@/lib/calendar/time-grid";
import { getCalendarEventSurfaceStyle } from "@/lib/calendar/event-styles";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  type CalendarSlotInterval,
  type ExpandedCalendarEvent,
} from "@/types/calendar-event";
import type { SwipeHandlers } from "@/lib/hooks/use-swipe-navigation";
import { useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 8;
const LONG_PRESS_MS = 450;

type TimedEventLayout = ReturnType<typeof layoutTimedEvents>[number];

type DragSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originTopPx: number;
  moved: boolean;
  dragEnabled: boolean;
  longPressTimer: number | null;
};

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

function DraggableTimedEvent({
  dayDate,
  intervalMinutes,
  layout,
  onEventSelect,
  onEventReschedule,
  onDragActiveChange,
}: {
  dayDate: string;
  intervalMinutes: CalendarSlotInterval;
  layout: TimedEventLayout;
  onEventSelect: (event: ExpandedCalendarEvent) => void;
  onEventReschedule?: (
    event: ExpandedCalendarEvent,
    startAt: string,
    endAt: string,
  ) => void;
  onDragActiveChange: (active: boolean) => void;
}) {
  const dragRef = useRef<DragSession | null>(null);
  const [previewTopPx, setPreviewTopPx] = useState<number | null>(null);
  const [isLongPressReady, setIsLongPressReady] = useState(false);
  const draggable = canDragCalendarEvent(layout.event) && Boolean(onEventReschedule);
  const topPx = previewTopPx ?? layout.topPx;
  const isDragging = previewTopPx !== null;

  const insetPx = 4;
  const gapPx = 2;
  const totalColumns = Math.round(100 / layout.widthPercent);
  const columnIndex = Math.round(layout.leftPercent / layout.widthPercent);
  const trackWidth = `(100% - ${insetPx * 2}px - ${Math.max(0, totalColumns - 1) * gapPx}px)`;

  function clearLongPressTimer() {
    const timer = dragRef.current?.longPressTimer;
    if (timer !== null && timer !== undefined) {
      window.clearTimeout(timer);
      if (dragRef.current) {
        dragRef.current.longPressTimer = null;
      }
    }
  }

  function resetDrag() {
    clearLongPressTimer();
    dragRef.current = null;
    setPreviewTopPx(null);
    setIsLongPressReady(false);
    onDragActiveChange(false);
  }

  function commitDrag(clientY: number) {
    const drag = dragRef.current;
    if (!drag?.moved || !onEventReschedule) {
      return;
    }

    const deltaY = clientY - drag.startClientY;
    const nextTopPx = clampDragTopPx(
      drag.originTopPx + deltaY,
      layout.heightPx,
      intervalMinutes,
    );
    const durationMinutes = eventDurationMinutes(layout.event.startAt, layout.event.endAt);
    const nextTimes = rescheduleTimesFromGridTop({
      dayDate,
      topPx: nextTopPx,
      durationMinutes,
      intervalMinutes,
    });

    if (
      nextTimes.startAt !== layout.event.startAt ||
      nextTimes.endAt !== layout.event.endAt
    ) {
      onEventReschedule(layout.event, nextTimes.startAt, nextTimes.endAt);
    }
  }

  return (
    <button
      className={`absolute box-border overflow-hidden rounded-[4px] px-1.5 py-1 text-left transition-shadow ${
        isDragging
          ? "z-30 cursor-grabbing shadow-lg ring-2 ring-[var(--cal-primary)]/40"
          : isLongPressReady
            ? "z-20 ring-2 ring-[var(--cal-primary)]/30"
            : "z-10"
      } ${draggable && (isLongPressReady || isDragging) ? "touch-none cursor-grabbing" : ""}`}
      onClick={(clickEvent) => {
        if (dragRef.current?.moved) {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          return;
        }
        clickEvent.stopPropagation();
        onEventSelect(layout.event);
      }}
      onPointerCancel={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        resetDrag();
      }}
      onPointerDown={(event) => {
        if (!draggable) {
          return;
        }

        const pointerId = event.pointerId;
        dragRef.current = {
          pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          originTopPx: layout.topPx,
          moved: false,
          dragEnabled: false,
          longPressTimer: window.setTimeout(() => {
            if (dragRef.current?.pointerId !== pointerId) {
              return;
            }
            dragRef.current.dragEnabled = true;
            dragRef.current.longPressTimer = null;
            setIsLongPressReady(true);
          }, LONG_PRESS_MS),
        };
        event.currentTarget.setPointerCapture(pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
          return;
        }

        const deltaY = event.clientY - drag.startClientY;
        const deltaX = event.clientX - drag.startClientX;

        if (!drag.dragEnabled) {
          if (Math.abs(deltaY) < DRAG_THRESHOLD_PX && Math.abs(deltaX) < DRAG_THRESHOLD_PX) {
            return;
          }
          resetDrag();
          event.currentTarget.releasePointerCapture(event.pointerId);
          return;
        }

        if (!drag.moved) {
          if (Math.abs(deltaY) < DRAG_THRESHOLD_PX && Math.abs(deltaX) < DRAG_THRESHOLD_PX) {
            return;
          }
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            resetDrag();
            event.currentTarget.releasePointerCapture(event.pointerId);
            return;
          }
          drag.moved = true;
          onDragActiveChange(true);
        }

        event.preventDefault();
        event.stopPropagation();
        setPreviewTopPx(
          clampDragTopPx(drag.originTopPx + deltaY, layout.heightPx, intervalMinutes),
        );
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
          return;
        }

        event.currentTarget.releasePointerCapture(event.pointerId);

        if (drag.moved) {
          event.preventDefault();
          event.stopPropagation();
          commitDrag(event.clientY);
          window.setTimeout(resetDrag, 0);
          return;
        }

        resetDrag();
      }}
      style={{
        top: topPx,
        height: layout.heightPx,
        left: `calc(${insetPx}px + ${trackWidth} * ${columnIndex / totalColumns} + ${columnIndex * gapPx}px)`,
        width: `calc(${trackWidth} * ${layout.widthPercent / 100})`,
        zIndex: isDragging ? 30 + columnIndex : 10 + columnIndex,
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
}

function DayTimedColumn({
  dayDate,
  events,
  intervalMinutes,
  slotHeight,
  gridHeight,
  slots,
  onSlotSelect,
  onEventSelect,
  onEventReschedule,
  onDragActiveChange,
}: {
  dayDate: string;
  events: ExpandedCalendarEvent[];
  intervalMinutes: CalendarSlotInterval;
  slotHeight: number;
  gridHeight: number;
  slots: Array<{ index: number; hour: number; minute: number; label: string }>;
  onSlotSelect: (startAt: string) => void;
  onEventSelect: (event: ExpandedCalendarEvent) => void;
  onEventReschedule?: (
    event: ExpandedCalendarEvent,
    startAt: string,
    endAt: string,
  ) => void;
  onDragActiveChange: (active: boolean) => void;
}) {
  const timedEvents = events.filter((event) => !event.allDay);
  const timedLayouts = layoutTimedEvents(timedEvents, dayDate, intervalMinutes);

  return (
    <div className="relative min-w-0 flex-1 border-l border-[var(--cal-border)]" style={{ height: gridHeight }}>
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

      {timedLayouts.map((layout) => (
        <DraggableTimedEvent
          key={layout.event.occurrenceId}
          dayDate={dayDate}
          intervalMinutes={intervalMinutes}
          layout={layout}
          onDragActiveChange={onDragActiveChange}
          onEventReschedule={onEventReschedule}
          onEventSelect={onEventSelect}
        />
      ))}
    </div>
  );
}

function DayAllDaySection({
  dayDate,
  events,
  onEventSelect,
}: {
  dayDate: string;
  events: ExpandedCalendarEvent[];
  onEventSelect: (event: ExpandedCalendarEvent) => void;
}) {
  const allDayEvents = events.filter((event) => event.allDay);
  if (allDayEvents.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-[var(--cal-border)] px-3 py-3 md:px-4">
      <p className="text-[0.6875rem] font-medium text-[var(--cal-text-muted)] md:text-[0.75rem]">
        {formatChineseMonthDay(dayDate)} · 全天
      </p>
      <div className="mt-2 space-y-1.5">
        {allDayEvents.map((event) => (
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
        ))}
      </div>
    </div>
  );
}

export function DayTimeGrid({
  dayDates,
  eventsByDate,
  intervalMinutes,
  onSlotSelect,
  onEventSelect,
  onEventReschedule,
  swipeHandlers,
}: {
  dayDates: string[];
  eventsByDate: Map<string, ExpandedCalendarEvent[]>;
  intervalMinutes: CalendarSlotInterval;
  onSlotSelect: (startAt: string) => void;
  onEventSelect: (event: ExpandedCalendarEvent) => void;
  onEventReschedule?: (
    event: ExpandedCalendarEvent,
    startAt: string,
    endAt: string,
  ) => void;
  swipeHandlers?: SwipeHandlers;
}) {
  const [isDraggingEvent, setIsDraggingEvent] = useState(false);
  const showMultiDay = dayDates.length > 1;

  const slotCount = getSlotCount(intervalMinutes);
  const slotHeight = getSlotHeightPx(intervalMinutes);
  const gridHeight = getGridHeightPx(intervalMinutes);

  const slots = Array.from({ length: slotCount }, (_, index) => {
    const totalMinutes = CALENDAR_DAY_START_HOUR * 60 + index * intervalMinutes;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return { index, hour, minute, label: minute === 0 ? formatTimeLabel(hour, 0) : "" };
  });

  const gridSwipeHandlers = isDraggingEvent ? undefined : swipeHandlers;

  const allDaySections = dayDates
    .map((date, index) => {
      const allDayEvents = (eventsByDate.get(date) ?? []).filter((event) => event.allDay);
      if (allDayEvents.length === 0) {
        return null;
      }

      return (
        <div
          key={date}
          className={`min-w-0 flex-1 ${index > 0 ? "hidden md:block" : ""}`}
        >
          <DayAllDaySection
            dayDate={date}
            events={allDayEvents}
            onEventSelect={onEventSelect}
          />
        </div>
      );
    })
    .filter(Boolean);

  return (
    <div
      className="touch-pan-y overflow-hidden rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)]"
      {...gridSwipeHandlers}
    >
      {showMultiDay ? (
        <div className="hidden border-b border-[var(--cal-border)] md:flex">
          <div className="w-14 shrink-0 bg-[var(--cal-primary-muted)]" />
          {dayDates.map((date, index) => (
            <div
              key={date}
              className={`min-w-0 flex-1 border-l border-[var(--cal-border)] px-3 py-2.5 ${
                index > 0 ? "hidden md:block" : ""
              }`}
            >
              <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">
                {formatChineseMonthDay(date)} {formatChineseWeekday(date)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {allDaySections.length > 0 ? (
        showMultiDay ? (
          <>
            <div className="md:hidden">{allDaySections[0]}</div>
            <div className="hidden border-b border-[var(--cal-border)] md:flex">
              <div className="w-14 shrink-0 bg-[var(--cal-primary-muted)]" />
              {allDaySections}
            </div>
          </>
        ) : (
          allDaySections[0]
        )
      ) : null}

      <div className="flex">
        <div
          className="w-14 shrink-0 border-r border-[var(--cal-border)] bg-[var(--cal-primary-muted)]"
          style={{ height: gridHeight }}
        >
          {slots.map((slot) => (
            <div
              key={slot.index}
              className="relative border-b border-[#eef2ee] pr-2 text-right text-[0.6875rem] text-[var(--cal-text-muted)]"
              style={{ height: slotHeight }}
            >
              {slot.label ? (
                <span className="absolute -top-2 right-2 bg-[var(--cal-primary-muted)] px-0.5">
                  {slot.label}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        {dayDates.map((date, index) => (
          <div
            key={date}
            className={`min-w-0 flex-1 ${index > 0 ? "hidden md:block" : ""}`}
          >
            <DayTimedColumn
              dayDate={date}
              events={eventsByDate.get(date) ?? []}
              gridHeight={gridHeight}
              intervalMinutes={intervalMinutes}
              onDragActiveChange={setIsDraggingEvent}
              onEventReschedule={onEventReschedule}
              onEventSelect={onEventSelect}
              onSlotSelect={onSlotSelect}
              slotHeight={slotHeight}
              slots={slots}
            />
          </div>
        ))}
      </div>

      {onEventReschedule ? (
        <p className="border-t border-[var(--cal-border)] px-4 py-2 text-center text-[0.6875rem] text-[var(--cal-hint)]">
          長按行程後拖曳可調整時間
        </p>
      ) : null}
    </div>
  );
}
