import type { NotificationPermissionState } from "@/lib/calendar/calendar-reminder-runner";

export type { NotificationPermissionState };

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestAppNotificationPermission(): Promise<NotificationPermissionState> {
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
    icon: "/icon-192.png",
    badge: "/icon-192.png",
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
    icon: "/icon-192.png",
    tag: reminder.id,
  });

  notification.onclick = () => {
    window.focus();
    window.location.assign(reminder.url);
    notification.close();
  };

  return true;
}

export async function showAppNotification(reminder: {
  id: string;
  title: string;
  body: string;
  url: string;
}): Promise<boolean> {
  return (await showViaServiceWorker(reminder)) || showViaNotificationApi(reminder);
}
