import type { DailyFollowUpSnapshot } from "@/lib/customers/customer-follow-up-reminder";
import {
  buildCustomerFollowUpNotificationBody,
  buildDailyFollowUpSnapshot,
  markCustomerFollowUpReminderSent,
  shouldSendDailyCustomerFollowUpReminder,
} from "@/lib/customers/customer-follow-up-reminder";
import {
  getNotificationPermissionState,
  showAppNotification,
} from "@/lib/notifications/show-app-notification";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { todayISODate } from "@/lib/config/app-config";

const REMINDER_ID = "customer-follow-up-daily";

export async function runDailyCustomerFollowUpReminder(storage: StorageAdapter): Promise<boolean> {
  if (getNotificationPermissionState() !== "granted") {
    return false;
  }

  if (!shouldSendDailyCustomerFollowUpReminder(storage)) {
    return false;
  }

  const snapshot = buildDailyFollowUpSnapshot(storage);
  const delivered = await showAppNotification({
    id: REMINDER_ID,
    title: "今日顧客關懷",
    body: buildCustomerFollowUpNotificationBody(snapshot),
    url: "/customers",
  });

  if (delivered) {
    markCustomerFollowUpReminderSent(storage, todayISODate());
  }

  return delivered;
}

export function refreshDailyCustomerFollowUpReminder(storage: StorageAdapter): DailyFollowUpSnapshot {
  return buildDailyFollowUpSnapshot(storage);
}
