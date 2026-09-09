"use client";

import { useCallback, useEffect, useState } from "react";
import {
  completeWebPushEnableAfterGranted,
  disableWebPush,
  ENABLE_STAGE_LABEL,
  isWebPushSupported,
  requestNotificationPermissionFromGesture,
  resolvePushUiState,
  resyncWebPush,
  sendTestWebPush,
  type EnableWebPushProgress,
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
  const [stageLabel, setStageLabel] = useState<string | null>(null);
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

  function onProgress(progress: EnableWebPushProgress) {
    setStageLabel(progress.label);
  }

  /**
   * iOS Home Screen PWA: start requestPermission synchronously in the click
   * handler (before setState/await chains) so user activation is preserved.
   */
  async function onEnableClick() {
    if (busy) {
      return;
    }

    setMessage(null);

    // Kick off permission BEFORE any React state update / other awaits.
    const permissionPromise = requestNotificationPermissionFromGesture();
    setBusy(true);
    setStageLabel(ENABLE_STAGE_LABEL.permission);

    let permission: NotificationPermission | "unsupported";
    try {
      permission = await permissionPromise;
    } catch (error) {
      setBusy(false);
      setStageLabel(null);
      setMessage(error instanceof Error ? error.message : "請求通知權限失敗");
      return;
    }

    try {
      if (permission === "unsupported") {
        setState("unsupported");
        setMessage("此裝置不支援推播通知");
        return;
      }
      if (permission === "denied") {
        setState("denied");
        setMessage("通知權限已拒絕，請到系統設定開啟");
        return;
      }
      if (permission !== "granted") {
        setState("default");
        setMessage("尚未授權通知");
        return;
      }

      setState("granted_unsubscribed");
      const next = await completeWebPushEnableAfterGranted({ onProgress });
      setState(next);
      if (next === "subscribed") {
        setMessage("已開啟推播通知");
      } else {
        await refresh();
        setMessage("推播尚未完成訂閱，請再試一次");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "開啟推播失敗");
      try {
        await refresh();
      } catch {
        // ignore refresh failures after enable error
      }
    } finally {
      setBusy(false);
      setStageLabel(null);
    }
  }

  async function run(
    action: (opts: { onProgress: typeof onProgress }) => Promise<unknown>,
    successMessage: string,
  ) {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setStageLabel(null);
    try {
      await action({ onProgress });
      await refresh();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
      try {
        await refresh();
      } catch {
        // ignore
      }
    } finally {
      setBusy(false);
      setStageLabel(null);
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
        {busy && stageLabel ? (
          <p className="mt-1 text-[0.8125rem] text-[var(--brand-text-muted)]" aria-live="polite">
            {stageLabel}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2">
          {state !== "subscribed" && state !== "unsupported" && state !== "denied" ? (
            <button
              className="rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void onEnableClick()}
              type="button"
            >
              {busy ? stageLabel ?? "處理中…" : "開啟推播通知"}
            </button>
          ) : null}

          {state === "subscribed" || state === "granted_unsubscribed" ? (
            <button
              className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-[0.9375rem] font-semibold text-[var(--brand-text)] disabled:opacity-50"
              disabled={busy}
              onClick={() => void run(resyncWebPush, "已重新同步")}
              type="button"
            >
              {busy ? stageLabel ?? "同步中…" : "重新同步"}
            </button>
          ) : null}

          {state === "subscribed" ? (
            <button
              className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-[0.9375rem] font-semibold text-[var(--brand-text)] disabled:opacity-50"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await sendTestWebPush();
                }, "測試通知已送出")
              }
              type="button"
            >
              傳送測試通知
            </button>
          ) : null}

          {state === "subscribed" ? (
            <button
              className="rounded-2xl border border-[#f5d0d0] bg-[#fff8f8] px-4 py-3 text-[0.9375rem] font-semibold text-[#b42318] disabled:opacity-50"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await disableWebPush();
                }, "已關閉推播通知")
              }
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
