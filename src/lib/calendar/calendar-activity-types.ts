import {
  ACTIVITY_EVENT_KEYS,
  getRecordableEventTypesByGroup,
  type EventTypeDefinition,
} from "@/lib/event-center/event-types";

/** 行事曆上未分類的行程 */
export const CALENDAR_OTHER_ACTIVITY_KEY = "calendar_other";

export const CALENDAR_OTHER_ACTIVITY: EventTypeDefinition = {
  key: CALENDAR_OTHER_ACTIVITY_KEY,
  category: "activity",
  label: "其他",
  description: "其他行程",
  requiresValue: false,
  recordGroup: "daily",
};

export function getCalendarDailyActivityTypes(): EventTypeDefinition[] {
  return getRecordableEventTypesByGroup("daily");
}

export function getCalendarMeetingActivityTypes(): EventTypeDefinition[] {
  return getRecordableEventTypesByGroup("meeting");
}

export function getCalendarSelectableActivityTypes(): EventTypeDefinition[] {
  return [...getCalendarDailyActivityTypes(), ...getCalendarMeetingActivityTypes(), CALENDAR_OTHER_ACTIVITY];
}

export function getCalendarActivityTypeLabel(key: string | undefined): string {
  if (!key || key === CALENDAR_OTHER_ACTIVITY_KEY) {
    return CALENDAR_OTHER_ACTIVITY.label;
  }
  return (
    getCalendarSelectableActivityTypes().find((type) => type.key === key)?.label ?? key
  );
}

export function getCalendarActivityTypeGroup(
  key: string | undefined,
): "daily" | "meeting" | "other" {
  if (!key || key === CALENDAR_OTHER_ACTIVITY_KEY) {
    return "other";
  }
  const definition = getCalendarSelectableActivityTypes().find((type) => type.key === key);
  if (definition?.recordGroup === "meeting") {
    return "meeting";
  }
  if (definition?.recordGroup === "daily") {
    return "daily";
  }
  return "other";
}

/** 依共用行程標題推測種類 */
export function inferCalendarActivityTypeFromTitle(title: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes("hom")) {
    return "hom";
  }
  if (normalized.includes("sts")) {
    return "sts";
  }
  if (normalized.includes("商機")) {
    return "business_opportunity";
  }
  if (normalized.includes("量測")) {
    return ACTIVITY_EVENT_KEYS.MEASUREMENT;
  }
  if (normalized.includes("諮詢")) {
    return ACTIVITY_EVENT_KEYS.CONSULTATION;
  }
  if (normalized.includes("教練課") || normalized.includes("教練")) {
    return ACTIVITY_EVENT_KEYS.COACH_CLASS;
  }
  if (normalized.includes("營養")) {
    return "nutrition_class";
  }
  if (normalized.includes("培訓") || normalized.includes("訓練")) {
    return "one_day_training";
  }
  if (normalized.includes("會議")) {
    return "hom";
  }
  return CALENDAR_OTHER_ACTIVITY_KEY;
}
