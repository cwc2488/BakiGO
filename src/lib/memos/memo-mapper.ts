import type { Memo, MemoReminderType, MemoRow, MemoWeekday } from "@/lib/memos/types";
import { MEMO_REMINDER_TYPES } from "@/lib/memos/types";

function asReminderType(value: string): MemoReminderType {
  if (
    value === MEMO_REMINDER_TYPES.DAILY ||
    value === MEMO_REMINDER_TYPES.WEEKLY ||
    value === MEMO_REMINDER_TYPES.SPECIFIC_DATE
  ) {
    return value;
  }
  return MEMO_REMINDER_TYPES.NONE;
}

function asWeekday(value: number | null): MemoWeekday | null {
  if (value == null) return null;
  if (value >= 1 && value <= 7) return value as MemoWeekday;
  return null;
}

export function mapMemoRow(row: MemoRow): Memo {
  return {
    id: row.id,
    memberId: row.member_id,
    title: row.title,
    content: row.content,
    completed: row.completed,
    reminderType: asReminderType(row.reminder_type),
    reminderTime: row.reminder_time,
    reminderWeekday: asWeekday(row.reminder_weekday),
    reminderDate: row.reminder_date,
    nextReminderAt: row.next_reminder_at,
    lastNotifiedAt: row.last_notified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
