import type { CSSProperties } from "react";
import {
  CALENDAR_EVENT_COLORS,
  normalizeCalendarEventColor,
  type CalendarEventColor,
} from "@/types/calendar-event";

/** Premium event card: light tint surface + left accent bar */
export function getCalendarEventSurfaceStyle(
  color: CalendarEventColor,
  options?: { attended?: boolean },
): CSSProperties {
  const palette = CALENDAR_EVENT_COLORS[normalizeCalendarEventColor(color)];
  if (options?.attended) {
    return {
      backgroundColor: palette.tint,
      borderLeft: `3px solid ${palette.accent}`,
      borderTop: "1px solid rgba(0,0,0,0.04)",
      borderRight: "1px solid rgba(0,0,0,0.04)",
      borderBottom: "1px solid rgba(0,0,0,0.04)",
      color: palette.text,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    };
  }
  return {
    backgroundColor: palette.tint,
    borderLeft: `3px solid ${palette.accent}`,
    borderTop: "1px solid rgba(0,0,0,0.04)",
    borderRight: "1px solid rgba(0,0,0,0.04)",
    borderBottom: "1px solid rgba(0,0,0,0.04)",
    color: palette.text,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  };
}

export function getCalendarEventDotColor(color: CalendarEventColor): string {
  return CALENDAR_EVENT_COLORS[normalizeCalendarEventColor(color)].accent;
}

export function getCalendarEventAccentColor(color: CalendarEventColor): string {
  return CALENDAR_EVENT_COLORS[normalizeCalendarEventColor(color)].accent;
}
