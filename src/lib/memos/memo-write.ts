import { z } from "zod";
import { MEMO_REMINDER_TYPES } from "@/lib/memos/types";
import {
  computeNextReminderAt,
  isValidReminderDate,
  isValidReminderTime,
  isValidWeekday,
} from "@/lib/memos/reminder-schedule";
import type { MemoUpsertInput } from "@/lib/memos/types";

export const memoUpsertSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().max(4000).optional().nullable(),
  completed: z.boolean().optional(),
  reminderType: z.enum([
    MEMO_REMINDER_TYPES.NONE,
    MEMO_REMINDER_TYPES.DAILY,
    MEMO_REMINDER_TYPES.WEEKLY,
    MEMO_REMINDER_TYPES.SPECIFIC_DATE,
  ]),
  reminderTime: z.string().optional().nullable(),
  reminderWeekday: z.number().int().optional().nullable(),
  reminderDate: z.string().optional().nullable(),
});

export function normalizeMemoUpsert(
  raw: z.infer<typeof memoUpsertSchema>,
): { ok: true; value: MemoUpsertInput } | { ok: false; error: string } {
  const title = raw.title.trim();
  if (!title) {
    return { ok: false, error: "請填寫標題" };
  }

  const reminderType = raw.reminderType;
  const reminderTime = raw.reminderTime?.trim() || null;
  const reminderDate = raw.reminderDate?.trim() || null;
  const reminderWeekday =
    typeof raw.reminderWeekday === "number" ? raw.reminderWeekday : null;

  if (reminderType === MEMO_REMINDER_TYPES.NONE) {
    return {
      ok: true,
      value: {
        title,
        content: raw.content?.trim() ? raw.content.trim() : null,
        completed: raw.completed,
        reminderType,
        reminderTime: null,
        reminderWeekday: null,
        reminderDate: null,
      },
    };
  }

  if (!isValidReminderTime(reminderTime)) {
    return { ok: false, error: "請選擇提醒時間" };
  }

  if (reminderType === MEMO_REMINDER_TYPES.WEEKLY && !isValidWeekday(reminderWeekday)) {
    return { ok: false, error: "請選擇星期幾" };
  }

  if (reminderType === MEMO_REMINDER_TYPES.SPECIFIC_DATE && !isValidReminderDate(reminderDate)) {
    return { ok: false, error: "請選擇提醒日期" };
  }

  const value: MemoUpsertInput = {
    title,
    content: raw.content?.trim() ? raw.content.trim() : null,
    completed: raw.completed,
    reminderType,
    reminderTime,
    reminderWeekday:
      reminderType === MEMO_REMINDER_TYPES.WEEKLY && isValidWeekday(reminderWeekday)
        ? reminderWeekday
        : null,
    reminderDate: reminderType === MEMO_REMINDER_TYPES.SPECIFIC_DATE ? reminderDate : null,
  };

  // Specific date in the past with no future fire → still allow save, next=null.
  void computeNextReminderAt(value);

  return { ok: true, value };
}

export function buildMemoWriteRow(
  memberId: string,
  input: MemoUpsertInput,
  now: Date = new Date(),
): Record<string, unknown> {
  const completed = input.completed === true;
  const nextReminderAt = computeNextReminderAt(
    {
      ...input,
      completed,
    },
    now,
  );

  return {
    member_id: memberId,
    title: input.title,
    content: input.content ?? null,
    completed,
    reminder_type: input.reminderType,
    reminder_time: input.reminderTime,
    reminder_weekday: input.reminderWeekday,
    reminder_date: input.reminderDate,
    next_reminder_at: nextReminderAt,
    updated_at: now.toISOString(),
  };
}
