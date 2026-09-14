import { APP_TIMEZONE } from "@/lib/config/app-config";
import { MEMO_REMINDER_TYPES, MEMO_WEEKDAY_LABELS, type Memo } from "@/lib/memos/types";

function formatTaipeiDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: APP_TIMEZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatTaipeiDate(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    const [, month, day] = isoOrDate.split("-");
    return `${Number(month)}/${Number(day)}`;
  }
  const date = new Date(isoOrDate);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: APP_TIMEZONE,
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function isTaipeiToday(iso: string, now: Date = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso)) === fmt.format(now);
}

/** Compact reminder line for home / list rows. */
export function formatMemoReminderLabel(memo: Memo, now: Date = new Date()): string | null {
  if (memo.reminderType === MEMO_REMINDER_TYPES.NONE) {
    return null;
  }

  if (memo.reminderType === MEMO_REMINDER_TYPES.DAILY && memo.reminderTime) {
    return `每天 ${memo.reminderTime}`;
  }

  if (
    memo.reminderType === MEMO_REMINDER_TYPES.WEEKLY &&
    memo.reminderWeekday &&
    memo.reminderTime
  ) {
    const day = MEMO_WEEKDAY_LABELS[memo.reminderWeekday].replace("星期", "");
    return `每週${day} ${memo.reminderTime}`;
  }

  if (
    memo.reminderType === MEMO_REMINDER_TYPES.SPECIFIC_DATE &&
    memo.reminderDate &&
    memo.reminderTime
  ) {
    if (memo.nextReminderAt && isTaipeiToday(memo.nextReminderAt, now)) {
      return `今天 ${memo.reminderTime}`;
    }
    const todayParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    if (memo.reminderDate === todayParts) {
      return `今天 ${memo.reminderTime}`;
    }
    return `${formatTaipeiDate(memo.reminderDate)} ${memo.reminderTime}`;
  }

  if (memo.nextReminderAt) {
    if (isTaipeiToday(memo.nextReminderAt, now)) {
      const time = new Intl.DateTimeFormat("zh-TW", {
        timeZone: APP_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(memo.nextReminderAt));
      return `今天 ${time}`;
    }
    return formatTaipeiDateTime(memo.nextReminderAt);
  }

  return null;
}
