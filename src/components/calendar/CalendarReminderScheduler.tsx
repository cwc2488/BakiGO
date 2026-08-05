"use client";

import { CALENDAR_REMINDER_CHECK_INTERVAL_MS } from "@/lib/calendar/calendar-reminder-constants";
import {
  getNotificationPermissionState,
  refreshCalendarReminderSchedule,
  registerCalendarServiceWorker,
  runDueCalendarReminders,
} from "@/lib/calendar/calendar-reminder-runner";
import { useAuth } from "@/lib/auth/auth-context";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useEffect, useMemo } from "react";

export function CalendarReminderScheduler() {
  const { session } = useAuth();
  const storage = useMemo(() => createLocalStorageAdapter(), []);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      await registerCalendarServiceWorker();
      if (cancelled) {
        return;
      }

      if (getNotificationPermissionState() === "granted") {
        await refreshCalendarReminderSchedule(storage);
        await runDueCalendarReminders(storage);
      }
    }

    bootstrap();

    const intervalId = window.setInterval(() => {
      if (getNotificationPermissionState() === "granted") {
        void runDueCalendarReminders(storage);
      }
    }, CALENDAR_REMINDER_CHECK_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && getNotificationPermissionState() === "granted") {
        void refreshCalendarReminderSchedule(storage);
        void runDueCalendarReminders(storage);
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
