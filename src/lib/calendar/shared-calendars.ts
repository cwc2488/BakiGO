import type { CalendarEventColor } from "@/types/calendar-event";

export interface SharedGoogleCalendar {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  embedUrl: string;
  icalUrl: string;
  timezone: string;
  color: CalendarEventColor;
}

/** 預設共用 Google 行事曆（公開 iCal，無需 OAuth 即可讀取） */
export const DEFAULT_SHARED_GOOGLE_CALENDAR: SharedGoogleCalendar = {
  id: "j9uvfluaq5f8p7j087uiudmdhg@group.calendar.google.com",
  name: "Herbalife & X-LINE 行事曆",
  shortName: "共用行事曆",
  description: "僅供夥伴們參考使用（臨時調動的行事曆無法即時更新，請見諒）",
  embedUrl:
    "https://calendar.google.com/calendar/embed?src=j9uvfluaq5f8p7j087uiudmdhg%40group.calendar.google.com&ctz=Asia%2FTaipei",
  icalUrl:
    "https://calendar.google.com/calendar/ical/j9uvfluaq5f8p7j087uiudmdhg%40group.calendar.google.com/public/basic.ics",
  timezone: "Asia/Taipei",
  color: "green",
};

export const SHARED_GOOGLE_CALENDARS: SharedGoogleCalendar[] = [DEFAULT_SHARED_GOOGLE_CALENDAR];

export function findSharedGoogleCalendar(calendarId: string): SharedGoogleCalendar | undefined {
  return SHARED_GOOGLE_CALENDARS.find((calendar) => calendar.id === calendarId);
}

export function isSharedGoogleCalendarId(calendarId: string | undefined): boolean {
  return Boolean(calendarId && findSharedGoogleCalendar(calendarId));
}

/** 共用行事曆行程一律使用設定色（賀寶芙綠），忽略舊快取或 attendance 的 blue */
export function getSharedCalendarEventColor(calendarId: string | undefined): CalendarEventColor {
  if (calendarId) {
    const calendar = findSharedGoogleCalendar(calendarId);
    if (calendar) {
      return calendar.color;
    }
  }
  return DEFAULT_SHARED_GOOGLE_CALENDAR.color;
}
