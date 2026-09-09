"use client";

import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { urlBase64ToUint8Array } from "@/lib/push/vapid";
import type { NotificationPermissionUiState } from "@/lib/push/types";

const SW_PATH = "/sw.js";

export function isWebPushSupported(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getBrowserNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register(SW_PATH);
  } catch {
    return null;
  }
}

export async function getReadyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) {
    return null;
  }
  try {
    await registerAppServiceWorker();
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  const registration = await getReadyServiceWorker();
  if (!registration) {
    return null;
  }
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function fetchPublicVapidKey(): Promise<string> {
  // Prefer build-time public env when available; fall back to API.
  const fromEnv = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const res = await fetchWithMemberAuth("/api/push/vapid-public-key");
  if (!res.ok) {
    throw new Error("無法取得推播金鑰");
  }
  const data = (await res.json()) as { publicKey?: string };
  if (!data.publicKey) {
    throw new Error("推播尚未設定");
  }
  return data.publicKey;
}

function subscriptionToPayload(subscription: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
} {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("訂閱資料不完整");
  }
  return {
    endpoint: json.endpoint,
    p256dh,
    auth,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };
}

export async function syncPushSubscriptionToServer(
  subscription: PushSubscription,
): Promise<void> {
  const payload = subscriptionToPayload(subscription);
  const res = await fetchWithMemberAuth("/api/push/subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "同步推播訂閱失敗");
  }
}

/**
 * Enable Web Push. Must be called from a user gesture on iOS.
 */
export async function enableWebPush(): Promise<NotificationPermissionUiState> {
  if (!isWebPushSupported()) {
    return "unsupported";
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission === "denied") {
    return "denied";
  }
  if (permission !== "granted") {
    return "default";
  }

  const registration = await getReadyServiceWorker();
  if (!registration) {
    return "unsupported";
  }

  const publicKey = await fetchPublicVapidKey();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  await syncPushSubscriptionToServer(subscription);
  return "subscribed";
}

export async function resyncWebPush(): Promise<NotificationPermissionUiState> {
  if (!isWebPushSupported()) {
    return "unsupported";
  }
  if (Notification.permission !== "granted") {
    return Notification.permission === "denied" ? "denied" : "default";
  }

  const registration = await getReadyServiceWorker();
  if (!registration) {
    return "unsupported";
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return "granted_unsubscribed";
  }

  try {
    await syncPushSubscriptionToServer(subscription);
    return "subscribed";
  } catch {
    // Stale subscription — drop and re-subscribe.
    try {
      await subscription.unsubscribe();
    } catch {
      // ignore
    }
    return enableWebPush();
  }
}

export async function disableWebPush(): Promise<NotificationPermissionUiState> {
  const registration = await getReadyServiceWorker();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;

  if (subscription) {
    const endpoint = subscription.endpoint;
    try {
      await fetchWithMemberAuth("/api/push/subscriptions", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      });
    } catch {
      // Still attempt local unsubscribe.
    }
    try {
      await subscription.unsubscribe();
    } catch {
      // ignore
    }
  }

  if (!isWebPushSupported()) {
    return "unsupported";
  }
  if (Notification.permission === "denied") {
    return "denied";
  }
  if (Notification.permission === "granted") {
    return "granted_unsubscribed";
  }
  return "default";
}

export async function sendTestWebPush(): Promise<void> {
  const res = await fetchWithMemberAuth("/api/push/test", { method: "POST" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "測試通知發送失敗");
  }
}

export async function resolvePushUiState(): Promise<NotificationPermissionUiState> {
  if (!isWebPushSupported()) {
    return "unsupported";
  }
  const permission = Notification.permission;
  if (permission === "denied") {
    return "denied";
  }
  if (permission === "default") {
    return "default";
  }

  const subscription = await getExistingPushSubscription();
  if (!subscription) {
    return "granted_unsubscribed";
  }

  // Soft check: if we have a local subscription, treat as subscribed.
  // Server may be stale; user can re-sync.
  return "subscribed";
}

/** @deprecated Prefer registerAppServiceWorker — kept for calendar/customer schedulers. */
export async function registerCalendarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  return registerAppServiceWorker();
}
