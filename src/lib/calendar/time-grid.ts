import type { CalendarSlotInterval, ExpandedCalendarEvent } from "@/types/calendar-event";
import { CALENDAR_DAY_END_HOUR, CALENDAR_DAY_START_HOUR } from "@/types/calendar-event";

/** 行事曆牆上時間（Asia/Taipei），格式 YYYY-MM-DDTHH:mm */
export interface WallClockDateTime {
  date: string;
  hour: number;
  minute: number;
}

const WALL_CLOCK_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/;

/** Extreme-only fallback: hide behind +N when cards would be narrower than this (px) at mobile width. */
export const TIMED_EVENT_MIN_TAP_WIDTH_PX = 22;

/** Reference mobile event-column width for overflow threshold (390px − time gutter). */
export const TIMED_EVENT_MOBILE_TRACK_PX = 330;

/** 直接解析字串，不經 Date，避免瀏覽器時區造成位置偏移 */
export function parseWallClockDateTime(value: string): WallClockDateTime | null {
  const match = value.trim().match(WALL_CLOCK_RE);
  if (!match) {
    return null;
  }
  return {
    date: match[1],
    hour: match[2] ? Number(match[2]) : 0,
    minute: match[3] ? Number(match[3]) : 0,
  };
}

export function wallClockToDayMinutes(clock: WallClockDateTime): number {
  return clock.hour * 60 + clock.minute;
}

/** 事件開始時間距當日格線起點（06:00）的分鐘數 */
export function minutesFromWallClockStartAt(startAt: string, dayDate: string): number {
  const clock = parseWallClockDateTime(startAt);
  if (!clock) {
    return 0;
  }
  if (clock.date < dayDate) {
    return 0;
  }
  if (clock.date > dayDate) {
    return (CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) * 60;
  }
  return Math.max(0, (clock.hour - CALENDAR_DAY_START_HOUR) * 60 + clock.minute);
}

/** 事件結束時間距當日格線起點（06:00）的分鐘數 */
export function minutesFromWallClockEndAt(endAt: string, dayDate: string): number {
  const clock = parseWallClockDateTime(endAt);
  if (!clock) {
    return 0;
  }
  if (clock.date > dayDate) {
    return (CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) * 60;
  }
  if (clock.date < dayDate) {
    return 0;
  }
  return Math.max(0, (clock.hour - CALENDAR_DAY_START_HOUR) * 60 + clock.minute);
}

export function compareWallClock(left: string, right: string): number {
  return left.localeCompare(right);
}

export function isWallClockInDayRange(
  startAt: string,
  endAt: string,
  dayDate: string,
): boolean {
  const dayStart = `${dayDate}T00:00`;
  const dayEnd = `${dayDate}T23:59`;
  return startAt <= dayEnd && endAt >= dayStart;
}

export function parseLocalDateTime(value: string): Date {
  const clock = parseWallClockDateTime(value);
  if (clock) {
    return new Date(clock.date.replace(/-/g, "/") + ` ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

export function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTimeLabel(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function getDayBounds(date: string): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(`${date}T${String(CALENDAR_DAY_START_HOUR).padStart(2, "0")}:00:00`);
  const dayEnd = new Date(`${date}T${String(CALENDAR_DAY_END_HOUR).padStart(2, "0")}:00:00`);
  return { dayStart, dayEnd };
}

export function getSlotCount(intervalMinutes: CalendarSlotInterval): number {
  const totalMinutes = (CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) * 60;
  return totalMinutes / intervalMinutes;
}

export function getSlotHeightPx(intervalMinutes: CalendarSlotInterval): number {
  if (intervalMinutes === 30) {
    return 28;
  }
  if (intervalMinutes === 60) {
    return 48;
  }
  return 56;
}

export function getGridHeightPx(intervalMinutes: CalendarSlotInterval): number {
  return getSlotCount(intervalMinutes) * getSlotHeightPx(intervalMinutes);
}

export function minutesFromDayStart(date: Date, dayDate: string): number {
  const { dayStart } = getDayBounds(dayDate);
  return Math.max(0, (date.getTime() - dayStart.getTime()) / 60_000);
}

export function getEventLayout(
  startAt: string,
  endAt: string,
  dayDate: string,
  intervalMinutes: CalendarSlotInterval,
): { topPx: number; heightPx: number } {
  const startMin = minutesFromWallClockStartAt(startAt, dayDate);
  const endMin = Math.max(
    startMin + intervalMinutes,
    minutesFromWallClockEndAt(endAt, dayDate),
  );
  const slotHeight = getSlotHeightPx(intervalMinutes);
  const totalMinutes = (CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) * 60;
  const topPx = (startMin / intervalMinutes) * slotHeight;
  const durationMin = Math.max(intervalMinutes, endMin - startMin);
  const heightPx = Math.max(slotHeight * 0.75, (durationMin / intervalMinutes) * slotHeight);
  const maxHeight = (totalMinutes / intervalMinutes) * slotHeight - topPx;
  return {
    topPx,
    heightPx: Math.max(slotHeight * 0.5, Math.min(heightPx, maxHeight)),
  };
}

export interface TimedEventLayout {
  event: ExpandedCalendarEvent;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  column: number;
  /** Peak simultaneous events during this event's span — drives lane width */
  peakConcurrent: number;
  zIndex: number;
}

export interface TimedEventOverflowCluster {
  id: string;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  events: ExpandedCalendarEvent[];
}

export interface TimedEventsLayoutResult {
  layouts: TimedEventLayout[];
  overflowClusters: TimedEventOverflowCluster[];
}

/** Subtle horizontal overlap factor for dense lanes (mature calendar style). */
const LANE_OVERLAP_FACTOR = 1.06;

type LayoutItem = {
  event: ExpandedCalendarEvent;
  startMin: number;
  endMin: number;
  stableColumn: number;
};

function eventsOverlap(
  left: Pick<LayoutItem, "startMin" | "endMin">,
  right: Pick<LayoutItem, "startMin" | "endMin">,
): boolean {
  return left.startMin < right.endMin && left.endMin > right.startMin;
}

function mergeOverlapClusters(items: LayoutItem[]): LayoutItem[][] {
  const clusters: LayoutItem[][] = items.map((item) => [item]);

  let merged = true;
  while (merged) {
    merged = false;
    for (let index = 0; index < clusters.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < clusters.length; otherIndex += 1) {
        const overlaps = clusters[index].some((left) =>
          clusters[otherIndex].some((right) => eventsOverlap(left, right)),
        );
        if (overlaps) {
          clusters[index] = [...clusters[index], ...clusters[otherIndex]];
          clusters.splice(otherIndex, 1);
          merged = true;
          break;
        }
      }
      if (merged) {
        break;
      }
    }
  }

  return clusters;
}

function assignStableColumns(cluster: LayoutItem[]): void {
  const sorted = [...cluster].sort(
    (left, right) =>
      left.startMin - right.startMin || right.endMin - right.startMin - (left.endMin - left.startMin),
  );
  const columnEnds: number[] = [];

  for (const item of sorted) {
    let column = columnEnds.findIndex((endMin) => endMin <= item.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[column] = item.endMin;
    }
    item.stableColumn = column;
  }
}

function peakConcurrentDuring(item: LayoutItem, cluster: LayoutItem[]): number {
  const relevant = cluster.filter((other) => eventsOverlap(item, other));
  const checkpoints = new Set<number>([item.startMin, item.endMin]);

  for (const other of relevant) {
    if (other.startMin > item.startMin && other.startMin < item.endMin) {
      checkpoints.add(other.startMin);
    }
    if (other.endMin > item.startMin && other.endMin < item.endMin) {
      checkpoints.add(other.endMin);
    }
  }

  let peak = 1;
  for (const minute of checkpoints) {
    if (minute < item.startMin || minute >= item.endMin) {
      continue;
    }
    const concurrent = relevant.filter(
      (other) => other.startMin <= minute && other.endMin > minute,
    ).length;
    peak = Math.max(peak, concurrent);
  }

  return peak;
}

function shouldOverflowLayout(peakConcurrent: number): boolean {
  if (peakConcurrent <= 1) {
    return false;
  }
  const estimatedWidthPx = TIMED_EVENT_MOBILE_TRACK_PX / peakConcurrent;
  return estimatedWidthPx < TIMED_EVENT_MIN_TAP_WIDTH_PX;
}

function minutesToTopPx(minutes: number, intervalMinutes: CalendarSlotInterval): number {
  return (minutes / intervalMinutes) * getSlotHeightPx(intervalMinutes);
}

export type EventCardDensity = "wide" | "medium" | "narrow" | "minimal";

/** Progressive density reduction for overlapping cards. */
export function getEventCardDensity(widthPercent: number): EventCardDensity {
  if (widthPercent >= 38) {
    return "wide";
  }
  if (widthPercent >= 26) {
    return "medium";
  }
  if (widthPercent >= 17) {
    return "narrow";
  }
  return "minimal";
}

/**
 * Continuous-card overlap layout: one rectangle per event for its full duration.
 * Column assignment is stable; lanes use subtle horizontal overlap at high density.
 */
export function layoutTimedEvents(
  events: ExpandedCalendarEvent[],
  dayDate: string,
  intervalMinutes: CalendarSlotInterval,
): TimedEventsLayoutResult {
  if (events.length === 0) {
    return { layouts: [], overflowClusters: [] };
  }

  const items: LayoutItem[] = events.map((event) => {
    const startMin = minutesFromWallClockStartAt(event.startAt, dayDate);
    const endMin = Math.max(
      startMin + intervalMinutes,
      minutesFromWallClockEndAt(event.endAt, dayDate),
    );
    return {
      event,
      startMin,
      endMin,
      stableColumn: 0,
    };
  });

  const layouts: TimedEventLayout[] = [];
  const overflowItems: LayoutItem[] = [];

  for (const cluster of mergeOverlapClusters(items)) {
    assignStableColumns(cluster);

    for (const item of cluster) {
      const peakConcurrent = Math.max(1, peakConcurrentDuring(item, cluster));

      if (shouldOverflowLayout(peakConcurrent)) {
        overflowItems.push(item);
        continue;
      }

      const laneShare = 100 / peakConcurrent;
      const overlapFactor = peakConcurrent >= 3 ? LANE_OVERLAP_FACTOR : 1;
      const leftPercent = (item.stableColumn / peakConcurrent) * 100;
      const widthPercent = Math.min(laneShare * overlapFactor, 100 - leftPercent + laneShare * 0.06);

      const { topPx, heightPx } = getEventLayout(
        item.event.startAt,
        item.event.endAt,
        dayDate,
        intervalMinutes,
      );

      layouts.push({
        event: item.event,
        topPx,
        heightPx,
        leftPercent,
        widthPercent,
        column: item.stableColumn,
        peakConcurrent,
        zIndex: 10 + item.stableColumn,
      });
    }
  }

  const overflowClusters = buildOverflowClusters(overflowItems, dayDate, intervalMinutes);

  return { layouts, overflowClusters };
}

function buildOverflowClusters(
  items: LayoutItem[],
  dayDate: string,
  intervalMinutes: CalendarSlotInterval,
): TimedEventOverflowCluster[] {
  if (items.length === 0) {
    return [];
  }

  const sorted = [...items].sort((left, right) => left.startMin - right.startMin);
  const clusters: LayoutItem[][] = [];

  for (const item of sorted) {
    const cluster = clusters.find((group) =>
      group.some((member) => eventsOverlap(member, item)),
    );
    if (cluster) {
      cluster.push(item);
    } else {
      clusters.push([item]);
    }
  }

  return clusters.map((cluster, index) => {
    const topPx = Math.min(
      ...cluster.map((item) => minutesToTopPx(item.startMin, intervalMinutes)),
    );
    const bottomPx = Math.max(
      ...cluster.map((item) => minutesToTopPx(item.endMin, intervalMinutes)),
    );
    const maxConcurrent = cluster.length;
    const widthPercent = 100 / maxConcurrent;
    const leftPercent = (maxConcurrent - 1) * widthPercent;

    return {
      id: `overflow-${index}-${cluster.map((item) => item.event.occurrenceId).join("-")}`,
      topPx,
      heightPx: Math.max(getSlotHeightPx(intervalMinutes) * 0.5, bottomPx - topPx),
      leftPercent,
      widthPercent,
      events: cluster.map((item) => item.event),
    };
  });
}

export function slotIndexToTime(dayDate: string, slotIndex: number, intervalMinutes: CalendarSlotInterval): string {
  const totalMinutes = CALENDAR_DAY_START_HOUR * 60 + slotIndex * intervalMinutes;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dayDate}T${pad(hour)}:${pad(minute)}`;
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateOnly(date);
}

export function formatChineseWeekday(dateStr: string): string {
  const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const date = new Date(`${dateStr}T12:00:00`);
  return weekdays[date.getDay()] ?? "";
}

export function formatChineseMonthDay(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatChineseYearMonth(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function isSameDay(dateA: string, dateB: string): boolean {
  return dateA.slice(0, 10) === dateB.slice(0, 10);
}

export function getTodayDateString(): string {
  return formatDateOnly(new Date());
}

export function formatEventTimeRange(startAt: string, endAt: string, allDay: boolean): string {
  if (allDay) {
    return "全天";
  }
  return `${startAt.slice(11, 16)} – ${endAt.slice(11, 16)}`;
}

export function eventDurationMinutes(startAt: string, endAt: string): number {
  const startClock = parseWallClockDateTime(startAt);
  const endClock = parseWallClockDateTime(endAt);
  if (!startClock || !endClock) {
    return 60;
  }

  const startDate = parseLocalDateTime(startAt);
  const endDate = parseLocalDateTime(endAt);
  return Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60_000));
}

export function shiftWallClockDateTime(value: string, deltaMinutes: number): string {
  const date = parseLocalDateTime(value);
  date.setMinutes(date.getMinutes() + deltaMinutes);
  return formatLocalDateTime(date);
}

export function snapTopPxToGridMinutes(
  topPx: number,
  intervalMinutes: CalendarSlotInterval,
): number {
  const slotHeight = getSlotHeightPx(intervalMinutes);
  const slotIndex = Math.round(topPx / slotHeight);
  return slotIndex * intervalMinutes;
}

export function rescheduleTimesFromGridTop(input: {
  dayDate: string;
  topPx: number;
  durationMinutes: number;
  intervalMinutes: CalendarSlotInterval;
}): { startAt: string; endAt: string } {
  const gridTotalMinutes = (CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) * 60;
  const snappedMinutes = snapTopPxToGridMinutes(input.topPx, input.intervalMinutes);
  const maxStartMinutes = Math.max(0, gridTotalMinutes - input.durationMinutes);
  const clampedMinutes = Math.max(0, Math.min(maxStartMinutes, snappedMinutes));
  const slotIndex = clampedMinutes / input.intervalMinutes;
  const startAt = slotIndexToTime(input.dayDate, slotIndex, input.intervalMinutes);
  const endAt = shiftWallClockDateTime(startAt, input.durationMinutes);
  return { startAt, endAt };
}

export function clampDragTopPx(
  topPx: number,
  heightPx: number,
  intervalMinutes: CalendarSlotInterval,
): number {
  const slotHeight = getSlotHeightPx(intervalMinutes);
  const snappedTop = Math.round(topPx / slotHeight) * slotHeight;
  const maxTop = getGridHeightPx(intervalMinutes) - heightPx;
  return Math.max(0, Math.min(maxTop, snappedTop));
}
