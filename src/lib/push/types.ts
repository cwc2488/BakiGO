/** Shared Web Push payload + subscription shapes (no secrets). */

export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type PushSubscriptionRecord = {
  id: string;
  memberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  deviceLabel: string | null;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  isActive: boolean;
};

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
};

export type SendPushResult = {
  memberId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  deactivated: number;
};

export type NotificationPermissionUiState =
  | "unsupported"
  | "default"
  | "denied"
  | "granted_unsubscribed"
  | "subscribed";

export const PUSH_SOURCE = {
  calendarReminder: "calendar_reminder",
  leadFollowUp: "lead_follow_up",
  test: "test",
} as const;

export type PushSourceType = (typeof PUSH_SOURCE)[keyof typeof PUSH_SOURCE];
