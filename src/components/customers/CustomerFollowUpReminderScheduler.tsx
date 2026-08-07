"use client";

import { CALENDAR_REMINDER_CHECK_INTERVAL_MS } from "@/lib/calendar/calendar-reminder-constants";
import { registerCalendarServiceWorker } from "@/lib/calendar/calendar-reminder-runner";
import { runDailyCustomerFollowUpReminder } from "@/lib/customers/customer-follow-up-reminder-runner";
import { getNotificationPermissionState } from "@/lib/notifications/show-app-notification";
import { useAuth } from "@/lib/auth/auth-context";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useEffect, useMemo } from "react";

export function CustomerFollowUpReminderScheduler() {
  const { session } = useAuth();
  const storage = useMemo(() => createLocalStorageAdapter(), []);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      await registerCalendarServiceWorker();
      if (cancelled || getNotificationPermissionState() !== "granted") {
        return;
      }
      await runDailyCustomerFollowUpReminder(storage);
    }

    bootstrap();

    const intervalId = window.setInterval(() => {
      if (getNotificationPermissionState() === "granted") {
        void runDailyCustomerFollowUpReminder(storage);
      }
    }, CALENDAR_REMINDER_CHECK_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && getNotificationPermissionState() === "granted") {
        void runDailyCustomerFollowUpReminder(storage);
      }
    }

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [session, storage]);

  return null;
}
