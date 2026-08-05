/** 可選的行程提醒時間（分鐘，於開始前） */
export const CALENDAR_REMINDER_OPTIONS = [
  { minutes: 5, label: "5 分鐘前" },
  { minutes: 15, label: "15 分鐘前" },
  { minutes: 30, label: "30 分鐘前" },
  { minutes: 60, label: "1 小時前" },
  { minutes: 120, label: "2 小時前" },
  { minutes: 1440, label: "1 天前" },
] as const;

/** 新建行程／標記參加時的預設提醒 */
export const DEFAULT_CALENDAR_REMINDER_MINUTES = [15, 60];

export function formatReminderSummary(minutes: number[]): string {
  if (minutes.length === 0) {
    return "不提醒";
  }

  const labels = minutes
    .slice()
    .sort((left, right) => left - right)
    .map((value) => CALENDAR_REMINDER_OPTIONS.find((option) => option.minutes === value)?.label ?? `${value} 分鐘前`);

  return labels.join("、");
}

export function normalizeReminderMinutes(minutes: number[] | undefined): number[] {
  if (!minutes || minutes.length === 0) {
    return [];
  }

  const allowed = new Set<number>(CALENDAR_REMINDER_OPTIONS.map((option) => option.minutes));
  return [...new Set(minutes.filter((value) => allowed.has(value)))].sort(
    (left, right) => left - right,
  );
}
