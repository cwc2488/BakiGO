import {
  loadScheduledCalendarReminders,
  markCalendarReminderFired,
  syncCalendarReminders,
} from "@/lib/calendar/calendar-reminder-sync";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

export type NotificationPermissionState = NotificationPermission | "unsupported";

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestCalendarNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission === "denied") {
    return "denied";
  }

  return Notification.requestPermission();
}

async function showViaServiceWorker(reminder: {
  id: string;
  title: string;
  body: string;
  url: string;
}): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(reminder.title, {
    body: reminder.body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: reminder.id,
    data: { url: reminder.url },
  });
  return true;
}

function showViaNotificationApi(reminder: {
  id: string;
  title: string;
  body: string;
  url: string;
}): boolean {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  const notification = new Notification(reminder.title, {
    body: reminder.body,
    icon: "/icon.svg",
    tag: reminder.id,
  });

  notification.onclick = () => {
    window.focus();
    window.location.assign(reminder.url);
    notification.close();
  };

  return true;
}

export async function registerCalendarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function runDueCalendarReminders(storage: StorageAdapter): Promise<number> {
  if (getNotificationPermissionState() !== "granted") {
    return 0;
  }

  syncCalendarReminders(storage);
  const nowMs = Date.now();
  const due = loadScheduledCalendarReminders(storage).filter(
    (item) => !item.fired && new Date(item.fireAt).getTime() <= nowMs,
  );

  let shown = 0;
  for (const reminder of due) {
    const delivered =
      (await showViaServiceWorker(reminder)) || showViaNotificationApi(reminder);
    if (delivered) {
      markCalendarReminderFired(storage, reminder.id);
      shown += 1;
    }
  }

  return shown;
}

export async function refreshCalendarReminderSchedule(storage: StorageAdapter): Promise<void> {
  syncCalendarReminders(storage);

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "SYNC_CALENDAR_REMINDERS" });
  }
}
