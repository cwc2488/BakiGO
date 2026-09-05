import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { MEETING_KEY_LIST } from "@/lib/event-center/meeting-types";
import type { CalendarEventColor } from "@/types/calendar-event";

/** Canonical calendar category keys (stored in activityTypeKey for new events). */
export const CALENDAR_CATEGORY_KEYS = {
  MEETING: "meeting",
  CONSULTATION: ACTIVITY_EVENT_KEYS.CONSULTATION,
  COACH_CLASS: ACTIVITY_EVENT_KEYS.COACH_CLASS,
  MEASUREMENT: ACTIVITY_EVENT_KEYS.MEASUREMENT,
  /** Calendar-only category — not a KPI / activity-scoring event type. */
  DEVELOPMENT: "development",
  /** Calendar-only — personal blocked time; not KPI. */
  PRIVATE_TIME: "private_time",
  /** Calendar-only catch-all; not KPI. Distinct from legacy `calendar_other`. */
  OTHER: "other",
} as const;

export type CalendarCategoryKey =
  (typeof CALENDAR_CATEGORY_KEYS)[keyof typeof CALENDAR_CATEGORY_KEYS];

export interface CalendarCategoryDefinition {
  key: CalendarCategoryKey;
  label: string;
  defaultColor: CalendarEventColor;
}

export const CALENDAR_CATEGORIES: CalendarCategoryDefinition[] = [
  { key: CALENDAR_CATEGORY_KEYS.MEETING, label: "會議", defaultColor: "green" },
  { key: CALENDAR_CATEGORY_KEYS.CONSULTATION, label: "諮詢", defaultColor: "purple" },
  { key: CALENDAR_CATEGORY_KEYS.COACH_CLASS, label: "教練課", defaultColor: "orange" },
  { key: CALENDAR_CATEGORY_KEYS.MEASUREMENT, label: "量測", defaultColor: "blue" },
  { key: CALENDAR_CATEGORY_KEYS.DEVELOPMENT, label: "開發", defaultColor: "teal" },
  { key: CALENDAR_CATEGORY_KEYS.PRIVATE_TIME, label: "私人時間", defaultColor: "lavender" },
  { key: CALENDAR_CATEGORY_KEYS.OTHER, label: "其他", defaultColor: "gray" },
];

const LEGACY_MEETING_KEYS = new Set<string>(MEETING_KEY_LIST);

const CATEGORY_BY_KEY = new Map(
  CALENDAR_CATEGORIES.map((category) => [category.key, category]),
);

/** Legacy keys that should display as a calendar category but are no longer selectable. */
export function isLegacyMeetingActivityKey(key: string | undefined): boolean {
  if (!key) {
    return false;
  }
  return LEGACY_MEETING_KEYS.has(key);
}

export function isCalendarCategoryKey(key: string | undefined): key is CalendarCategoryKey {
  if (!key) {
    return false;
  }
  return CATEGORY_BY_KEY.has(key as CalendarCategoryKey);
}

/** Map stored activityTypeKey → canonical category for UI / stats. Preserves legacy meeting subtypes as 會議. */
export function resolveCalendarCategoryKey(key: string | undefined): CalendarCategoryKey {
  if (isCalendarCategoryKey(key)) {
    return key;
  }
  if (isLegacyMeetingActivityKey(key)) {
    return CALENDAR_CATEGORY_KEYS.MEETING;
  }
  if (key === "calendar_other") {
    return CALENDAR_CATEGORY_KEYS.MEETING;
  }
  return CALENDAR_CATEGORY_KEYS.MEETING;
}

export function getCalendarCategoryLabel(key: string | undefined): string {
  const resolved = resolveCalendarCategoryKey(key);
  return CATEGORY_BY_KEY.get(resolved)?.label ?? "會議";
}

export function getCalendarCategoryDefaultColor(key: string | undefined): CalendarEventColor {
  const resolved = resolveCalendarCategoryKey(key);
  return CATEGORY_BY_KEY.get(resolved)?.defaultColor ?? "green";
}

/** Normalize legacy keys when saving from the calendar form (optional migration on edit). */
export function normalizeCalendarCategoryKeyForSave(key: string | undefined): CalendarCategoryKey {
  return resolveCalendarCategoryKey(key);
}
