"use client";

import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { urlBase64ToUint8Array } from "@/lib/push/vapid";
import type { NotificationPermissionUiState } from "@/lib/push/types";

const SW_PATH = "/sw.js";

export type EnableWebPushStage =
  | "permission"
  | "service_worker"
  | "vapid"
  | "subscribe"
  | "sync";

export type EnableWebPushProgress = {
  stage: EnableWebPushStage;
  label: string;
};

export const ENABLE_STAGE_LABEL: Record<EnableWebPushStage, string> = {
  permission: "請求通知權限…",
  service_worker: "準備 Service Worker…",
  vapid: "取得推播金鑰…",
  subscribe: "建立推播訂閱…",
  sync: "同步到伺服器…",
};

export class PushClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PushClientError";
    this.code = code;
  }
}

const TIMEOUT_MS = {
  permission: 45_000,
  swRegister: 12_000,
  swReady: 15_000,
  getSubscription: 10_000,
  subscribe: 20_000,
  vapid: 12_000,
  sync: 15_000,
  unsubscribe: 10_000,
} as const;

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  code: string,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new PushClientError(code, message));
    }, ms);

    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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

/**
 * Must be invoked directly from a user-gesture handler on iOS PWA.
 * Do not await unrelated work before calling this.
 */
export async function requestNotificationPermissionFromGesture(): Promise<NotificationPermission | "unsupported"> {
  if (!isWebPushSupported()) {
    return "unsupported";
  }

  const current = Notification.permission;
  if (current !== "default") {
    return current;
  }

  return withTimeout(
    Notification.requestPermission(),
    TIMEOUT_MS.permission,
    "permission_timeout",
    "請求通知權限逾時，請再試一次",
  );
}

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await withTimeout(
      navigator.serviceWorker.register(SW_PATH),
      TIMEOUT_MS.swRegister,
      "sw_register_timeout",
      "Service Worker 註冊逾時",
    );
  } catch (error) {
    if (error instanceof PushClientError) {
      throw error;
    }
    return null;
  }
}

export async function getReadyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) {
    return null;
  }

  const registration = await registerAppServiceWorker();
  if (!registration) {
    return null;
  }
  if (registration.active) {
    return registration;
  }

  try {
    return await withTimeout(
      navigator.serviceWorker.ready,
      TIMEOUT_MS.swReady,
      "sw_ready_timeout",
      "Service Worker 尚未就緒（逾時），請關閉 App 後重開再試",
    );
  } catch (error) {
    if (error instanceof PushClientError) {
      throw error;
    }
    return null;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  const registration = await getReadyServiceWorker();
  if (!registration) {
    return null;
  }
  try {
    return await withTimeout(
      registration.pushManager.getSubscription(),
      TIMEOUT_MS.getSubscription,
      "get_subscription_timeout",
      "讀取推播訂閱逾時",
    );
  } catch (error) {
    if (error instanceof PushClientError) {
      throw error;
    }
    return null;
  }
}

async function fetchPublicVapidKey(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const res = await withTimeout(
    fetchWithMemberAuth("/api/push/vapid-public-key"),
    TIMEOUT_MS.vapid,
    "vapid_fetch_timeout",
    "取得推播金鑰逾時",
  );
  if (!res.ok) {
    throw new PushClientError("vapid_fetch_failed", "無法取得推播金鑰");
  }
  const data = (await res.json()) as { publicKey?: string };
  if (!data.publicKey) {
    throw new PushClientError("vapid_missing", "推播尚未設定");
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
    throw new PushClientError("subscription_incomplete", "訂閱資料不完整");
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
  const res = await withTimeout(
    fetchWithMemberAuth("/api/push/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    TIMEOUT_MS.sync,
    "sync_timeout",
    "同步推播訂閱逾時",
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new PushClientError("sync_failed", data.error ?? "同步推播訂閱失敗");
  }
}

function reportProgress(
  onProgress: ((progress: EnableWebPushProgress) => void) | undefined,
  stage: EnableWebPushStage,
): void {
  onProgress?.({ stage, label: ENABLE_STAGE_LABEL[stage] });
}

/**
 * Complete enable after notification permission is already granted.
 * Safe to call after an awaited permission prompt.
 */
export async function completeWebPushEnableAfterGranted(options?: {
  onProgress?: (progress: EnableWebPushProgress) => void;
}): Promise<NotificationPermissionUiState> {
  if (!isWebPushSupported()) {
    throw new PushClientError("unsupported", "此裝置不支援推播通知");
  }
  if (Notification.permission !== "granted") {
    if (Notification.permission === "denied") {
      return "denied";
    }
    return "default";
  }

  reportProgress(options?.onProgress, "service_worker");
  const registration = await getReadyServiceWorker();
  if (!registration) {
    throw new PushClientError(
      "sw_unavailable",
      "Service Worker 無法使用。iPhone 請確認已加入主畫面後重試",
    );
  }

  reportProgress(options?.onProgress, "vapid");
  const publicKey = await fetchPublicVapidKey();

  reportProgress(options?.onProgress, "subscribe");
  let subscription = await withTimeout(
    registration.pushManager.getSubscription(),
    TIMEOUT_MS.getSubscription,
    "get_subscription_timeout",
    "讀取推播訂閱逾時",
  );
  if (!subscription) {
    subscription = await withTimeout(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }),
      TIMEOUT_MS.subscribe,
      "subscribe_timeout",
      "建立推播訂閱逾時，請再試一次",
    );
  }

  reportProgress(options?.onProgress, "sync");
  await syncPushSubscriptionToServer(subscription);
  return "subscribed";
}

/**
 * Enable Web Push from a click handler.
 *
 * iOS Home Screen PWA: `requestPermission` runs as the first await
 * (no preceding network/SW awaits) so user activation is preserved.
 */
export async function enableWebPush(options?: {
  onProgress?: (progress: EnableWebPushProgress) => void;
}): Promise<NotificationPermissionUiState> {
  if (!isWebPushSupported()) {
    return "unsupported";
  }

  reportProgress(options?.onProgress, "permission");
  const permission = await requestNotificationPermissionFromGesture();
  if (permission === "unsupported") {
    return "unsupported";
  }
  if (permission === "denied") {
    return "denied";
  }
  if (permission !== "granted") {
    return "default";
  }

  return completeWebPushEnableAfterGranted(options);
}

export async function resyncWebPush(options?: {
  onProgress?: (progress: EnableWebPushProgress) => void;
}): Promise<NotificationPermissionUiState> {
  if (!isWebPushSupported()) {
    return "unsupported";
  }
  if (Notification.permission !== "granted") {
    return Notification.permission === "denied" ? "denied" : "default";
  }

  reportProgress(options?.onProgress, "service_worker");
  const registration = await getReadyServiceWorker();
  if (!registration) {
    throw new PushClientError("sw_unavailable", "Service Worker 無法使用");
  }

  reportProgress(options?.onProgress, "subscribe");
  const subscription = await withTimeout(
    registration.pushManager.getSubscription(),
    TIMEOUT_MS.getSubscription,
    "get_subscription_timeout",
    "讀取推播訂閱逾時",
  );
  if (!subscription) {
    return "granted_unsubscribed";
  }

  try {
    reportProgress(options?.onProgress, "sync");
    await syncPushSubscriptionToServer(subscription);
    return "subscribed";
  } catch {
    try {
      await withTimeout(
        subscription.unsubscribe(),
        TIMEOUT_MS.unsubscribe,
        "unsubscribe_timeout",
        "取消舊訂閱逾時",
      );
    } catch {
      // ignore and re-enable
    }
    return enableWebPush(options);
  }
}

export async function disableWebPush(): Promise<NotificationPermissionUiState> {
  let registration: ServiceWorkerRegistration | null = null;
  try {
    registration = await getReadyServiceWorker();
  } catch {
    registration = null;
  }
  let subscription: PushSubscription | null = null;
  if (registration) {
    try {
      subscription = await withTimeout(
        registration.pushManager.getSubscription(),
        TIMEOUT_MS.getSubscription,
        "get_subscription_timeout",
        "讀取推播訂閱逾時",
      );
    } catch {
      subscription = null;
    }
  }

  if (subscription) {
    const endpoint = subscription.endpoint;
    try {
      await withTimeout(
        fetchWithMemberAuth("/api/push/subscriptions", {
          method: "DELETE",
          body: JSON.stringify({ endpoint }),
        }),
        TIMEOUT_MS.sync,
        "disable_sync_timeout",
        "關閉推播同步逾時",
      );
    } catch {
      // Still attempt local unsubscribe.
    }
    try {
      await withTimeout(
        subscription.unsubscribe(),
        TIMEOUT_MS.unsubscribe,
        "unsubscribe_timeout",
        "取消訂閱逾時",
      );
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
  const res = await withTimeout(
    fetchWithMemberAuth("/api/push/test", { method: "POST" }),
    TIMEOUT_MS.sync,
    "test_timeout",
    "測試通知逾時",
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new PushClientError("test_failed", data.error ?? "測試通知發送失敗");
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

  try {
    const subscription = await getExistingPushSubscription();
    if (!subscription) {
      return "granted_unsubscribed";
    }
    return "subscribed";
  } catch {
    // SW/subscription probe timed out — permission is still granted.
    return "granted_unsubscribed";
  }
}

/** @deprecated Prefer registerAppServiceWorker — kept for calendar/customer schedulers. */
export async function registerCalendarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  return registerAppServiceWorker();
}
