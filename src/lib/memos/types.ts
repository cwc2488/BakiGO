export const MEMO_REMINDER_TYPES = {
  NONE: "NONE",
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  SPECIFIC_DATE: "SPECIFIC_DATE",
} as const;

export type MemoReminderType = (typeof MEMO_REMINDER_TYPES)[keyof typeof MEMO_REMINDER_TYPES];

/** ISO weekday: 1 = Monday … 7 = Sunday (Asia/Taipei). */
export type MemoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Memo = {
  id: string;
  memberId: string;
  title: string;
  content: string | null;
  completed: boolean;
  reminderType: MemoReminderType;
  reminderTime: string | null;
  reminderWeekday: MemoWeekday | null;
  reminderDate: string | null;
  nextReminderAt: string | null;
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoUpsertInput = {
  title: string;
  content?: string | null;
  completed?: boolean;
  reminderType: MemoReminderType;
  reminderTime?: string | null;
  reminderWeekday?: MemoWeekday | null;
  reminderDate?: string | null;
};

export type MemoRow = {
  id: string;
  member_id: string;
  title: string;
  content: string | null;
  completed: boolean;
  reminder_type: string;
  reminder_time: string | null;
  reminder_weekday: number | null;
  reminder_date: string | null;
  next_reminder_at: string | null;
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

export const MEMO_WEEKDAY_LABELS: Record<MemoWeekday, string> = {
  1: "星期一",
  2: "星期二",
  3: "星期三",
  4: "星期四",
  5: "星期五",
  6: "星期六",
  7: "星期日",
};
