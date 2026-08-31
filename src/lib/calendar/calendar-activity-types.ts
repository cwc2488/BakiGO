import {
  CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_KEYS,
  getCalendarCategoryDefaultColor,
  getCalendarCategoryLabel,
  isCalendarCategoryKey,
  isLegacyMeetingActivityKey,
  normalizeCalendarCategoryKeyForSave,
  resolveCalendarCategoryKey,
} from "@/lib/calendar/calendar-categories";
import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";

/** @deprecated Use CALENDAR_CATEGORY_KEYS — kept for backward compatibility */
export const CALENDAR_OTHER_ACTIVITY_KEY = "calendar_other";

export function getCalendarSelectableCategories() {
  return CALENDAR_CATEGORIES;
}

export function getCalendarActivityTypeLabel(key: string | undefined): string {
  return getCalendarCategoryLabel(key);
}

export function getCalendarActivityTypeGroup(
  key: string | undefined,
): "daily" | "meeting" | "other" {
  const resolved = resolveCalendarCategoryKey(key);
  if (resolved === CALENDAR_CATEGORY_KEYS.MEETING) {
    return "meeting";
  }
  return "daily";
}

/** 依共用行程標題推測分類 */
export function inferCalendarActivityTypeFromTitle(title: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes("量測")) {
    return ACTIVITY_EVENT_KEYS.MEASUREMENT;
  }
  if (normalized.includes("諮詢")) {
    return ACTIVITY_EVENT_KEYS.CONSULTATION;
  }
  if (normalized.includes("教練課") || normalized.includes("教練")) {
    return ACTIVITY_EVENT_KEYS.COACH_CLASS;
  }
  return CALENDAR_CATEGORY_KEYS.MEETING;
}

export {
  CALENDAR_CATEGORY_KEYS,
  getCalendarCategoryDefaultColor,
  getCalendarCategoryLabel,
  isCalendarCategoryKey,
  isLegacyMeetingActivityKey,
  normalizeCalendarCategoryKeyForSave,
  resolveCalendarCategoryKey,
};
