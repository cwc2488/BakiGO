import type { EntityId, ISODateString, StoredEntity } from "./common";

export type CalendarEventColor =
  | "green"
  | "emerald"
  | "teal"
  | "sky"
  | "blue"
  | "indigo"
  | "purple"
  | "lavender"
  | "pink"
  | "rose"
  | "orange"
  | "amber"
  | "gray"
  /** @deprecated Legacy palette — normalized on read */
  | "red";

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

/** 重複行程的單次例外（刪除或覆寫某一個 occurrence） */
export interface RecurrenceException {
  /** 該次 occurrence 的日期 YYYY-MM-DD */
  occurrenceDate: ISODateString;
  deleted?: boolean;
  override?: {
    title?: string;
    notes?: string;
    startAt?: string;
    endAt?: string;
    allDay?: boolean;
    color?: CalendarEventColor;
    activityTypeKey?: CalendarActivityTypeKey;
    reminderMinutes?: number[];
  };
}

export type RecurrenceEditScope = "this" | "this_and_future";

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
  recurrenceExceptions?: RecurrenceException[];
  /** 行程分類 key（會議 / 諮詢 / 教練課 / 量測 / 開發）；舊資料可能仍為 meeting subtype */
  activityTypeKey?: CalendarActivityTypeKey;
  /** 從共用行事曆標記「會參加」後固定顯示 */
  attendedFromShared?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  /** 開始前 N 分鐘提醒，例如 [15, 60] */
  reminderMinutes?: number[];
  /**
   * Stable Customer.id list for this personal event (canonical participant link).
   * Not names — survives customer rename. Unique in repository layer.
   */
  participantCustomerIds?: EntityId[];
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
  recurrenceExceptions?: RecurrenceException[];
  activityTypeKey?: CalendarActivityTypeKey;
  attendedFromShared?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  reminderMinutes?: number[];
  participantCustomerIds?: EntityId[];
}

export interface CalendarEventUpdateInput {
  title?: string;
  notes?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  color?: CalendarEventColor;
  recurrence?: RecurrenceRule;
  recurrenceExceptions?: RecurrenceException[];
  activityTypeKey?: CalendarActivityTypeKey;
  attendedFromShared?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  reminderMinutes?: number[];
  participantCustomerIds?: EntityId[];
}

/** 展開後的單次 occurrence（含指向母事件） */
export interface ExpandedCalendarEvent {
  occurrenceId: string;
  sourceEventId: EntityId;
  /** 重複序列中的原始日期（例外刪除/修改用，不受 override 時間影響） */
  occurrenceDate: string;
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

/** 對應紀錄中心的活動類型 key（量測、諮詢、會議等） */
export type CalendarActivityTypeKey = string;

export interface GoogleCalendarConnection {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
  selectedCalendarId?: string;
  selectedCalendarName?: string;
}

/** Curated premium palette — muted saturation, readable on light surfaces. */
export const CALENDAR_EVENT_COLORS: Record<
  CalendarEventColor,
  { label: string; accent: string; tint: string; text: string }
> = {
  green: { label: "綠", accent: "#3d8b40", tint: "#eef6ee", text: "#1d1d1f" },
  emerald: { label: "翠綠", accent: "#2f9e72", tint: "#ecf8f3", text: "#1d1d1f" },
  teal: { label: "青", accent: "#2a9d9a", tint: "#ecf7f7", text: "#1d1d1f" },
  sky: { label: "天藍", accent: "#3b82c4", tint: "#edf5fc", text: "#1d1d1f" },
  blue: { label: "藍", accent: "#3b6fd4", tint: "#edf2fc", text: "#1d1d1f" },
  indigo: { label: "靛", accent: "#5b5bd6", tint: "#f0f0fc", text: "#1d1d1f" },
  purple: { label: "紫", accent: "#8b5cf6", tint: "#f5f0fd", text: "#1d1d1f" },
  lavender: { label: "薰衣草", accent: "#9b7ec8", tint: "#f6f2fb", text: "#1d1d1f" },
  pink: { label: "粉", accent: "#d4578a", tint: "#fdf0f6", text: "#1d1d1f" },
  rose: { label: "玫瑰", accent: "#c45c6a", tint: "#fdf0f2", text: "#1d1d1f" },
  orange: { label: "橙", accent: "#d4822a", tint: "#fdf5ec", text: "#1d1d1f" },
  amber: { label: "琥珀", accent: "#c4922a", tint: "#fdf8ec", text: "#1d1d1f" },
  gray: { label: "灰", accent: "#8e8e93", tint: "#f2f2f7", text: "#1d1d1f" },
  red: { label: "紅", accent: "#c45c6a", tint: "#fdf0f2", text: "#1d1d1f" },
};

/** Colors shown in the event form picker (excludes legacy-only values). */
export const CALENDAR_EVENT_COLOR_OPTIONS: CalendarEventColor[] = [
  "green",
  "emerald",
  "teal",
  "sky",
  "blue",
  "indigo",
  "purple",
  "lavender",
  "pink",
  "rose",
  "orange",
  "amber",
];

const LEGACY_COLOR_ALIASES: Partial<Record<string, CalendarEventColor>> = {
  red: "rose",
};

export function normalizeCalendarEventColor(
  color: CalendarEventColor | string | undefined,
  fallback: CalendarEventColor = "green",
): CalendarEventColor {
  if (color && color in CALENDAR_EVENT_COLORS) {
    return LEGACY_COLOR_ALIASES[color] ?? (color as CalendarEventColor);
  }
  return fallback;
}

export const CALENDAR_DAY_START_HOUR = 6;
export const CALENDAR_DAY_END_HOUR = 24;
