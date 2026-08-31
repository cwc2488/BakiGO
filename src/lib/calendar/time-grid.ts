import type { CalendarSlotInterval, ExpandedCalendarEvent } from "@/types/calendar-event";
import { CALENDAR_DAY_END_HOUR, CALENDAR_DAY_START_HOUR } from "@/types/calendar-event";

/** 行事曆牆上時間（Asia/Taipei），格式 YYYY-MM-DDTHH:mm */
export interface WallClockDateTime {
  date: string;
  hour: number;
  minute: number;
}

const WALL_CLOCK_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/;

/** Maximum side-by-side columns before collapsing into "+N more". */
export const TIMED_EVENT_MAX_VISIBLE_COLUMNS = 3;

/** Minimum readable card width (% of day column). */
export const TIMED_EVENT_MIN_WIDTH_PERCENT = 24;

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
  columnSpan: number;
  maxConcurrent: number;
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

type LayoutItem = {
  event: ExpandedCalendarEvent;
  topPx: number;
  heightPx: number;
  startMin: number;
  endMin: number;
  column: number;
  columnSpan: number;
  maxConcurrent: number;
};

function eventsOverlap(left: Pick<LayoutItem, "startMin" | "endMin">, right: Pick<LayoutItem, "startMin" | "endMin">): boolean {
  return left.startMin < right.endMin && left.endMin > right.startMin;
}

function countConcurrentAt(items: LayoutItem[], minute: number): number {
  return items.filter((item) => item.startMin <= minute && item.endMin > minute).length;
}

function maxConcurrentDuring(item: LayoutItem, items: LayoutItem[]): number {
  const boundaries = new Set<number>([item.startMin, item.endMin]);
  for (const other of items) {
    if (eventsOverlap(item, other)) {
      boundaries.add(Math.max(item.startMin, other.startMin));
      boundaries.add(Math.min(item.endMin, other.endMin));
    }
  }

  let max = 1;
  for (const minute of boundaries) {
    if (minute >= item.startMin && minute < item.endMin) {
      max = Math.max(max, countConcurrentAt(items, minute));
    }
  }
  return max;
}

function canExpandIntoColumn(item: LayoutItem, column: number, items: LayoutItem[]): boolean {
  return !items.some(
    (other) =>
      other !== item &&
      other.column === column &&
      eventsOverlap(item, other),
  );
}

/**
 * Interval-based overlap layout: columns are assigned greedily, but width is
 * derived from per-event max concurrency (not the whole transitive cluster).
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
    const { topPx, heightPx } = getEventLayout(event.startAt, event.endAt, dayDate, intervalMinutes);
    const startMin = minutesFromWallClockStartAt(event.startAt, dayDate);
    const endMin = Math.max(
      startMin + intervalMinutes,
      minutesFromWallClockEndAt(event.endAt, dayDate),
    );
    return {
      event,
      topPx,
      heightPx,
      startMin,
      endMin,
      column: 0,
      columnSpan: 1,
      maxConcurrent: 1,
    };
  });

  items.sort((left, right) => left.startMin - right.startMin || right.endMin - left.endMin);

  const columnEnds: number[] = [];
  for (const item of items) {
    let column = columnEnds.findIndex((endMin) => endMin <= item.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[column] = item.endMin;
    }
    item.column = column;
  }

  for (const item of items) {
    item.maxConcurrent = maxConcurrentDuring(item, items);
    let columnSpan = 1;
    for (let column = item.column + 1; column < item.maxConcurrent; column += 1) {
      if (!canExpandIntoColumn(item, column, items)) {
        break;
      }
      columnSpan += 1;
    }
    item.columnSpan = columnSpan;
  }

  const visibleLayouts: TimedEventLayout[] = [];
  const overflowItems: LayoutItem[] = [];

  for (const item of items) {
    const widthPercent = (item.columnSpan / item.maxConcurrent) * 100;
    const leftPercent = (item.column / item.maxConcurrent) * 100;
    const exceedsColumnCap = item.column >= TIMED_EVENT_MAX_VISIBLE_COLUMNS;
    const tooNarrow = widthPercent < TIMED_EVENT_MIN_WIDTH_PERCENT && item.maxConcurrent > 1;

    if (exceedsColumnCap || tooNarrow) {
      overflowItems.push(item);
      continue;
    }

    visibleLayouts.push({
      event: item.event,
      topPx: item.topPx,
      heightPx: item.heightPx,
      leftPercent,
      widthPercent,
      column: item.column,
      columnSpan: item.columnSpan,
      maxConcurrent: item.maxConcurrent,
    });
  }

  const overflowClusters = buildOverflowClusters(overflowItems);

  return { layouts: visibleLayouts, overflowClusters };
}

function buildOverflowClusters(items: LayoutItem[]): TimedEventOverflowCluster[] {
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
    const topPx = Math.min(...cluster.map((item) => item.topPx));
    const bottomPx = Math.max(...cluster.map((item) => item.topPx + item.heightPx));
    const maxConcurrent = Math.max(...cluster.map((item) => item.maxConcurrent));
    const slotColumn = Math.min(TIMED_EVENT_MAX_VISIBLE_COLUMNS - 1, maxConcurrent - 1);
    const widthPercent = 100 / maxConcurrent;
    const leftPercent = slotColumn * widthPercent;

    return {
      id: `overflow-${index}-${cluster.map((item) => item.event.occurrenceId).join("-")}`,
      topPx,
      heightPx: Math.max(28, bottomPx - topPx),
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
