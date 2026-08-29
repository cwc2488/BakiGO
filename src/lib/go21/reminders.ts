import {
  GO21_MAX_REMINDERS_PER_DAY,
  GO21_QUIET_HOURS,
  GO21_REENGAGEMENT_IDLE_DAYS,
  GO21_REMINDER_COOLDOWN_HOURS,
  type Go21ReminderKind,
} from "@/types/go21";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";

export type Go21ReminderPolicy = {
  quietStartHour: number;
  quietEndHour: number;
  maxPerDay: number;
  cooldownHours: number;
  reengagementIdleDays: number;
};

export const DEFAULT_GO21_REMINDER_POLICY: Go21ReminderPolicy = {
  quietStartHour: GO21_QUIET_HOURS.startHour,
  quietEndHour: GO21_QUIET_HOURS.endHour,
  maxPerDay: GO21_MAX_REMINDERS_PER_DAY,
  cooldownHours: GO21_REMINDER_COOLDOWN_HOURS,
  reengagementIdleDays: GO21_REENGAGEMENT_IDLE_DAYS,
};

/** True if Taipei local hour is inside quiet hours (wraps midnight). */
export function isGo21QuietHour(
  hourTaipei: number,
  policy: Go21ReminderPolicy = DEFAULT_GO21_REMINDER_POLICY,
): boolean {
  const { quietStartHour, quietEndHour } = policy;
  if (quietStartHour === quietEndHour) return false;
  if (quietStartHour > quietEndHour) {
    return hourTaipei >= quietStartHour || hourTaipei < quietEndHour;
  }
  return hourTaipei >= quietStartHour && hourTaipei < quietEndHour;
}

export function nextGo21DeliveryAt(input: {
  desiredAt: Date;
  now?: Date;
  policy?: Go21ReminderPolicy;
}): Date {
  const policy = input.policy ?? DEFAULT_GO21_REMINDER_POLICY;
  const candidate = new Date(Math.max(input.desiredAt.getTime(), (input.now ?? new Date()).getTime()));
  // Shift into Taipei wall-clock by formatting — use UTC+8 approx for scheduling math
  for (let i = 0; i < 48; i += 1) {
    const taipeiHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Taipei",
        hour: "numeric",
        hour12: false,
      }).format(candidate),
    );
    if (!isGo21QuietHour(taipeiHour, policy)) {
      return candidate;
    }
    candidate.setTime(candidate.getTime() + 60 * 60 * 1000);
  }
  return candidate;
}

export function buildDeterministicReminderPreview(input: {
  kind: Go21ReminderKind;
  openLoopSubject?: string | null;
  dayNumber?: number | null;
}): string {
  switch (input.kind) {
    case "open_loop":
      return input.openLoopSubject
        ? `還記得我們說要看的「${input.openLoopSubject}」嗎？有空回我一下就好。`
        : "有件事我們昨天約好要再看一下，有空回我一聲。";
    case "measurement_day7":
      return "第 7 天了。若方便，可以做一次身體數據回測；不方便也能稍後再量。";
    case "measurement_day14":
      return "第 14 天可以選擇回測一次。這不是考試，有量就記錄，沒量也繼續陪跑。";
    case "measurement_day21":
      return "21 天快結束了。有空的話做最終回測；沒量也沒關係，我會用這段時間的紀錄幫你做回顧。";
    case "experiment":
      return input.openLoopSubject
        ? `實驗提醒：${input.openLoopSubject}`
        : "今天要不要試一下我們說好的小調整？";
    case "reengagement":
      return "這幾天比較少聽到你。不用補完美紀錄，回來說一句近況就好。";
    case "daily_light":
    default:
      return "今天過得怎麼樣？吃了什麼或想聊的，直接跟我說就好。";
  }
}

export function shouldScheduleMeasurementReminder(dayNumber: number): Go21ReminderKind | null {
  if (dayNumber === 7) return "measurement_day7";
  if (dayNumber === 14) return "measurement_day14";
  if (dayNumber === 21) return "measurement_day21";
  return null;
}

export function reengagementDueDate(lastActiveLogDate: string | null | undefined): string | null {
  if (!lastActiveLogDate) return null;
  return addCalendarDays(lastActiveLogDate, DEFAULT_GO21_REMINDER_POLICY.reengagementIdleDays);
}

export function isReengagementDue(lastActiveLogDate: string | null | undefined, today = coachingTodayLogDate()): boolean {
  const due = reengagementDueDate(lastActiveLogDate);
  return Boolean(due && today >= due);
}
