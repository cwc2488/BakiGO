import { isSharedGoogleCalendarId } from "@/lib/calendar/shared-calendars";
import type { ExpandedCalendarEvent } from "@/types/calendar-event";

export function canDragCalendarEvent(event: ExpandedCalendarEvent): boolean {
  if (event.allDay) {
    return false;
  }
  if (event.attendedFromShared) {
    return false;
  }
  if (isSharedGoogleCalendarId(event.googleCalendarId)) {
    return false;
  }
  if (event.isRecurringInstance) {
    return false;
  }
  return true;
}
