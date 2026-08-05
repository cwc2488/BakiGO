import type { EntityId, ISODateString, StoredEntity } from "./common";

export type CalendarEventColor =
  | "blue"
  | "green"
  | "orange"
  | "red"
  | "purple"
  | "teal"
  | "gray";

export type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly" | "custom";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** 每 N 天／週／月 */
  interval: number;
  endDate?: ISODateString;
  count?: number;
  /** 永不結束，直到刪除行程 */
  neverEnds?: boolean;
  /** frequency 為 custom 時的實際單位 */
  customUnit?: "daily" | "weekly" | "monthly";
  /** 週重複：0=週日 … 6=週六 */
  weekdays?: number[];
}

export interface CalendarEvent extends StoredEntity {
  memberId: EntityId;
  title: string;
  notes?: string;
  /** ISO 8601 本地時間字串 YYYY-MM-DDTHH:mm */
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: CalendarEventColor;
  recurrence: RecurrenceRule;
  /** 行程種類：量測、諮詢、會議等，供統計使用 */
  activityTypeKey?: CalendarActivityTypeKey;
  /** 從共用行事曆標記「會參加」後固定顯示 */
  attendedFromShared?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  /** 開始前 N 分鐘提醒，例如 [15, 60] */
  reminderMinutes?: number[];
}

export interface CalendarEventCreateInput {
  memberId: EntityId;
  title: string;
  notes?: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  color: CalendarEventColor;
  recurrence?: RecurrenceRule;
  activityTypeKey?: CalendarActivityTypeKey;
  attendedFromShared?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  reminderMinutes?: number[];
}

export interface CalendarEventUpdateInput {
  title?: string;
  notes?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  color?: CalendarEventColor;
  recurrence?: RecurrenceRule;
  activityTypeKey?: CalendarActivityTypeKey;
  attendedFromShared?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  reminderMinutes?: number[];
}

/** 展開後的單次 occurrence（含指向母事件） */
export interface ExpandedCalendarEvent {
  occurrenceId: string;
  sourceEventId: EntityId;
  title: string;
  notes?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: CalendarEventColor;
  isRecurringInstance: boolean;
  activityTypeKey?: CalendarActivityTypeKey;
  attendedFromShared?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
}

export type CalendarSlotInterval = 30 | 60 | 120;

/** 對應紀錄中心的活動類型 key（量測、諮詢、HOM 等） */
export type CalendarActivityTypeKey = string;

export interface GoogleCalendarConnection {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
  selectedCalendarId?: string;
  selectedCalendarName?: string;
}

export const CALENDAR_EVENT_COLORS: Record<
  CalendarEventColor,
  { label: string; bg: string; border: string; text: string }
> = {
  blue: { label: "藍", bg: "#5ac8fa", border: "#007aff", text: "#ffffff" },
  green: { label: "綠", bg: "#77b539", border: "#248a3d", text: "#ffffff" },
  orange: { label: "橙", bg: "#ff9f0a", border: "#b25000", text: "#1d1d1f" },
  red: { label: "紅", bg: "#ff375f", border: "#cf1322", text: "#ffffff" },
  purple: { label: "紫", bg: "#bf5af2", border: "#8944ab", text: "#ffffff" },
  teal: { label: "青", bg: "#64d2ff", border: "#248a3d", text: "#1d1d1f" },
  gray: { label: "灰", bg: "#86868b", border: "#636366", text: "#ffffff" },
};

export const CALENDAR_DAY_START_HOUR = 6;
export const CALENDAR_DAY_END_HOUR = 24;
