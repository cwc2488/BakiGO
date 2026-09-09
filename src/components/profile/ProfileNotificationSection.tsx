"use client";

import { useCallback, useEffect, useState } from "react";
import {
  disableWebPush,
  enableWebPush,
  isWebPushSupported,
  resolvePushUiState,
  resyncWebPush,
  sendTestWebPush,
} from "@/lib/push/subscription-client";
import type { NotificationPermissionUiState } from "@/lib/push/types";
import { ProfileCard, ProfileSectionTitle } from "./ui";
import { APP_ICON } from "@/lib/ui/app-icons";

const STATE_LABEL: Record<NotificationPermissionUiState, string> = {
  unsupported: "未支援",
  default: "未授權",
  denied: "已拒絕",
  granted_unsubscribed: "已授權但未訂閱",
  subscribed: "已訂閱",
};

export function ProfileNotificationSection() {
  const [state, setState] = useState<NotificationPermissionUiState>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isWebPushSupported()) {
      setState("unsupported");
      return;
    }
    const next = await resolvePushUiState();
    setState(next);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await refresh();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProfileCard>
      <div id="notifications" className="scroll-mt-24">
        <ProfileSectionTitle icon={APP_ICON.action.notify}>推播通知</ProfileSectionTitle>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--brand-text-muted)]">
          關閉 App 後仍可收到行事曆與名單追蹤提醒（需加入主畫面的 PWA）。
        </p>
        <p className="mt-3 text-[0.9375rem] font-semibold text-[var(--brand-text)]">
          狀態：{STATE_LABEL[state]}
        </p>

        <div className="mt-4 grid gap-2">
          {state !== "subscribed" && state !== "unsupported" && state !== "denied" ? (
            <button
              className="rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void run(enableWebPush, "已開啟推播通知")}
              type="button"
            >
              開啟推播通知
            </button>
          ) : null}

          {state === "subscribed" || state === "granted_unsubscribed" ? (
            <button
              className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-[0.9375rem] font-semibold text-[var(--brand-text)] disabled:opacity-50"
              disabled={busy}
              onClick={() => void run(resyncWebPush, "已重新同步")}
              type="button"
            >
              重新同步
            </button>
          ) : null}

          {state === "subscribed" ? (
            <button
              className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-[0.9375rem] font-semibold text-[var(--brand-text)] disabled:opacity-50"
              disabled={busy}
              onClick={() => void run(sendTestWebPush, "測試通知已送出")}
              type="button"
            >
              傳送測試通知
            </button>
          ) : null}

          {state === "subscribed" ? (
            <button
              className="rounded-2xl border border-[#f5d0d0] bg-[#fff8f8] px-4 py-3 text-[0.9375rem] font-semibold text-[#b42318] disabled:opacity-50"
              disabled={busy}
              onClick={() => void run(disableWebPush, "已關閉推播通知")}
              type="button"
            >
              關閉推播通知
            </button>
          ) : null}

          {state === "denied" ? (
            <p className="text-[0.8125rem] leading-relaxed text-[var(--brand-text-muted)]">
              請到系統設定允許 Baki Go 通知後再回來重新開啟。
            </p>
          ) : null}

          {state === "unsupported" ? (
            <p className="text-[0.8125rem] leading-relaxed text-[var(--brand-text-muted)]">
              此裝置或瀏覽器不支援 Web Push。iPhone 請先「加入主畫面」後再開啟。
            </p>
          ) : null}
        </div>

        {message ? (
          <p className="mt-3 text-[0.8125rem] text-[var(--brand-primary-dark)]">{message}</p>
        ) : null}
      </div>
    </ProfileCard>
  );
}
