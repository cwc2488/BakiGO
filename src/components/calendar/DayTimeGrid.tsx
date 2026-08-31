"use client";

import { canDragCalendarEvent } from "@/lib/calendar/can-drag-calendar-event";
import { getCalendarActivityTypeLabel } from "@/lib/calendar/calendar-activity-types";
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
  type TimedEventLayout,
  type TimedEventOverflowCluster,
} from "@/lib/calendar/time-grid";
import { getCalendarEventSurfaceStyle } from "@/lib/calendar/event-styles";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  type CalendarSlotInterval,
  type ExpandedCalendarEvent,
} from "@/types/calendar-event";
import type { SwipeHandlers } from "@/lib/hooks/use-swipe-navigation";
import { useEffect, useRef, useState } from "react";
import {
  MobileDismissibleSheet,
  MobileDismissibleSheetBody,
  MobileDismissibleSheetHandle,
} from "@/components/ui/MobileDismissibleSheet";

const DRAG_THRESHOLD_PX = 8;
const LONG_PRESS_MS = 450;

type DragSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originTopPx: number;
  moved: boolean;
  dragEnabled: boolean;
  longPressTimer: number | null;
  captureTarget: HTMLElement | null;
};

function layoutPositionStyle(layout: {
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  column: number;
  maxConcurrent: number;
}) {
  const insetPx = 3;
  const gapPx = 2;
  const trackWidth = `(100% - ${insetPx * 2}px - ${Math.max(0, layout.maxConcurrent - 1) * gapPx}px)`;
  return {
    top: layout.topPx,
    height: layout.heightPx,
    left: `calc(${insetPx}px + ${trackWidth} * ${layout.leftPercent / 100} + ${layout.column * gapPx}px)`,
    width: `calc(${trackWidth} * ${layout.widthPercent / 100})`,
  };
}

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
      <div className="relative flex items-center">
        <span className="absolute -left-[5px] h-[9px] w-[9px] rounded-full bg-[#e25555] ring-2 ring-white" />
        <div className="h-px flex-1 bg-[#e25555]/80" />
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
  interactionResetKey,
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
  interactionResetKey: number;
}) {
  const dragRef = useRef<DragSession | null>(null);
  const [previewTopPx, setPreviewTopPx] = useState<number | null>(null);
  const [isLongPressReady, setIsLongPressReady] = useState(false);
  const draggable = canDragCalendarEvent(layout.event) && Boolean(onEventReschedule);
  const topPx = previewTopPx ?? layout.topPx;
  const isDragging = previewTopPx !== null;
  const position = layoutPositionStyle({ ...layout, topPx });

  function clearLongPressTimer() {
    const timer = dragRef.current?.longPressTimer;
    if (timer !== null && timer !== undefined) {
      window.clearTimeout(timer);
      if (dragRef.current) {
        dragRef.current.longPressTimer = null;
      }
    }
  }

  function releaseCapture() {
    const drag = dragRef.current;
    if (drag?.captureTarget && drag.pointerId !== undefined) {
      try {
        if (drag.captureTarget.hasPointerCapture(drag.pointerId)) {
          drag.captureTarget.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // Pointer may already be released.
      }
    }
  }

  function resetDrag() {
    clearLongPressTimer();
    releaseCapture();
    dragRef.current = null;
    setPreviewTopPx(null);
    setIsLongPressReady(false);
    onDragActiveChange(false);
  }

  useEffect(() => {
    resetDrag();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on interaction key only
  }, [interactionResetKey]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      releaseCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const showTime = layout.heightPx >= 40;
  const showCategory = layout.heightPx >= 56;

  return (
    <button
      className={`absolute box-border overflow-hidden rounded-lg px-2 py-1 text-left transition-shadow ${
        isDragging
          ? "z-30 cursor-grabbing shadow-md ring-2 ring-[#3d8b40]/30"
          : isLongPressReady
            ? "z-20 ring-2 ring-[#3d8b40]/20"
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
          releaseCapture();
        }
        resetDrag();
      }}
      onPointerDown={(event) => {
        if (!draggable) {
          return;
        }

        const pointerId = event.pointerId;
        const captureTarget = event.currentTarget;
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
          captureTarget,
        };
        captureTarget.setPointerCapture(pointerId);
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
          return;
        }

        if (!drag.moved) {
          if (Math.abs(deltaY) < DRAG_THRESHOLD_PX && Math.abs(deltaX) < DRAG_THRESHOLD_PX) {
            return;
          }
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            resetDrag();
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

        releaseCapture();

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
        ...position,
        zIndex: isDragging ? 30 + layout.column : 10 + layout.column,
        ...getCalendarEventSurfaceStyle(layout.event.color, {
          attended: layout.event.attendedFromShared,
        }),
      }}
      type="button"
    >
      <p className="truncate text-[0.75rem] font-semibold leading-tight text-[#1d1d1f]">
        {layout.event.title}
      </p>
      {showTime ? (
        <p className="truncate text-[0.625rem] leading-tight text-[#86868b]">
          {formatEventTimeRange(layout.event.startAt, layout.event.endAt, layout.event.allDay)}
        </p>
      ) : null}
      {showCategory && layout.event.activityTypeKey ? (
        <p className="truncate text-[0.5625rem] leading-tight text-[#aeaeb2]">
          {getCalendarActivityTypeLabel(layout.event.activityTypeKey)}
        </p>
      ) : null}
    </button>
  );
}

function OverflowClusterButton({
  cluster,
  onEventSelect,
}: {
  cluster: TimedEventOverflowCluster;
  onEventSelect: (event: ExpandedCalendarEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const position = layoutPositionStyle({
    topPx: cluster.topPx,
    heightPx: cluster.heightPx,
    leftPercent: cluster.leftPercent,
    widthPercent: cluster.widthPercent,
    column: Math.round(cluster.leftPercent / cluster.widthPercent),
    maxConcurrent: Math.round(100 / cluster.widthPercent),
  });

  return (
    <>
      <button
        className="absolute z-10 overflow-hidden rounded-lg border border-dashed border-[#c7c7cc] bg-[#f9f9fb] px-1.5 py-1 text-left shadow-sm"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        style={position}
        type="button"
      >
        <p className="truncate text-[0.6875rem] font-semibold text-[#636366]">
          +{cluster.events.length} 更多
        </p>
      </button>

      <MobileDismissibleSheet
        onClose={() => setOpen(false)}
        open={open}
        panelClassName="w-full max-w-md rounded-t-[1.75rem] bg-[var(--cal-surface)] shadow-xl sm:rounded-[1.75rem]"
        rootClassName="z-[140]"
      >
        <MobileDismissibleSheetHandle />
        <div className="border-b border-[var(--cal-border)] px-6 py-4">
          <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">同時段行程</h3>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">{cluster.events.length} 個重疊事件</p>
        </div>
        <MobileDismissibleSheetBody className="px-4 py-3">
          <ul className="space-y-2">
            {cluster.events.map((event) => (
              <li key={event.occurrenceId}>
                <button
                  className="w-full rounded-xl px-3 py-2.5 text-left"
                  onClick={() => {
                    setOpen(false);
                    onEventSelect(event);
                  }}
                  style={getCalendarEventSurfaceStyle(event.color, {
                    attended: event.attendedFromShared,
                  })}
                  type="button"
                >
                  <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">{event.title}</p>
                  <p className="mt-0.5 text-[0.75rem] text-[#86868b]">
                    {formatEventTimeRange(event.startAt, event.endAt, event.allDay)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </MobileDismissibleSheetBody>
      </MobileDismissibleSheet>
    </>
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
  interactionResetKey,
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
  interactionResetKey: number;
}) {
  const timedEvents = events.filter((event) => !event.allDay);
  const { layouts, overflowClusters } = layoutTimedEvents(timedEvents, dayDate, intervalMinutes);

  return (
    <div className="relative min-w-0 flex-1" style={{ height: gridHeight }}>
      {slots.map((slot) => (
        <button
          key={slot.index}
          className={`block w-full hover:bg-[#f7f8f7]/80 ${
            slot.minute === 0 ? "border-b border-[#ececec]" : "border-b border-[#f4f4f4]"
          }`}
          onClick={() => onSlotSelect(slotIndexToTime(dayDate, slot.index, intervalMinutes))}
          style={{ height: slotHeight }}
          type="button"
        />
      ))}

      <CurrentTimeIndicator dayDate={dayDate} intervalMinutes={intervalMinutes} />

      {layouts.map((layout) => (
        <DraggableTimedEvent
          key={layout.event.occurrenceId}
          dayDate={dayDate}
          interactionResetKey={interactionResetKey}
          intervalMinutes={intervalMinutes}
          layout={layout}
          onDragActiveChange={onDragActiveChange}
          onEventReschedule={onEventReschedule}
          onEventSelect={onEventSelect}
        />
      ))}

      {overflowClusters.map((cluster) => (
        <OverflowClusterButton
          key={cluster.id}
          cluster={cluster}
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
    <div className="border-b border-[#ececec] px-3 py-3 md:px-4">
      <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-[#aeaeb2]">
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
  interactionResetKey,
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
  interactionResetKey: number;
}) {
  const [isDraggingEvent, setIsDraggingEvent] = useState(false);
  const showMultiDay = dayDates.length > 1;

  useEffect(() => {
    setIsDraggingEvent(false);
  }, [interactionResetKey]);

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
      className="touch-pan-y overflow-hidden rounded-2xl border border-[#ececec] bg-white shadow-sm"
      {...gridSwipeHandlers}
    >
      {showMultiDay ? (
        <div className="hidden border-b border-[#ececec] md:flex">
          <div className="w-12 shrink-0" />
          {dayDates.map((date, index) => (
            <div
              key={date}
              className={`min-w-0 flex-1 px-3 py-2.5 ${index > 0 ? "hidden md:block" : ""}`}
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
            <div className="hidden border-b border-[#ececec] md:flex">
              <div className="w-12 shrink-0" />
              {allDaySections}
            </div>
          </>
        ) : (
          allDaySections[0]
        )
      ) : null}

      <div className="flex">
        <div className="w-12 shrink-0" style={{ height: gridHeight }}>
          {slots.map((slot) => (
            <div
              key={slot.index}
              className="relative pr-1.5 text-right text-[0.625rem] font-medium text-[#aeaeb2]"
              style={{ height: slotHeight }}
            >
              {slot.label ? (
                <span className="absolute -top-2 right-1">{slot.label}</span>
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
              interactionResetKey={interactionResetKey}
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
        <p className="border-t border-[#ececec] px-4 py-2 text-center text-[0.6875rem] text-[#aeaeb2]">
          長按行程後拖曳可調整時間
        </p>
      ) : null}
    </div>
  );
}
