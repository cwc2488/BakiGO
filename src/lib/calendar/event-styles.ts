import type { CSSProperties } from "react";
import { CALENDAR_EVENT_COLORS, type CalendarEventColor } from "@/types/calendar-event";

/** Apple 行事曆風格：左側不透明色條 + 半透明底色 */
export function getCalendarEventSurfaceStyle(
  color: CalendarEventColor,
  options?: { attended?: boolean },
): CSSProperties {
  const palette = CALENDAR_EVENT_COLORS[color];
  if (options?.attended) {
    return {
      backgroundColor: `${palette.bg}45`,
      borderLeft: `4px solid ${palette.border}`,
      color: "#1d1d1f",
    };
  }
  return {
    backgroundColor: `${palette.bg}18`,
    borderLeft: `4px solid ${palette.bg}`,
    color: "#1d1d1f",
  };
}

export function getCalendarEventDotColor(color: CalendarEventColor): string {
  return CALENDAR_EVENT_COLORS[color].bg;
}
