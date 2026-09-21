"use client";

import { CALENDAR_REMINDER_CHECK_INTERVAL_MS } from "@/lib/calendar/calendar-reminder-constants";
import {
  getNotificationPermissionState,
  refreshCalendarReminderSchedule,
  runDueCalendarReminders,
} from "@/lib/calendar/calendar-reminder-runner";
import { registerAppServiceWorker } from "@/lib/push/subscription-client";
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
    let scheduleSynced = false;

    async function bootstrap() {
      await registerAppServiceWorker();
      if (cancelled) {
        return;
      }

      if (getNotificationPermissionState() === "granted") {
        // Full reminder rebuild once per session bootstrap — not on every focus.
        if (!scheduleSynced) {
          await refreshCalendarReminderSchedule(storage);
          scheduleSynced = true;
        }
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
        // Due-only on resume — event create/update paths refresh the schedule themselves.
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
