"use client";

import {
  getNotificationPermissionState,
  refreshCalendarReminderSchedule,
  requestCalendarNotificationPermission,
} from "@/lib/calendar/calendar-reminder-runner";
import { IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useCallback, useMemo, useState } from "react";

export function NotificationPermissionBanner() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [permission, setPermission] = useState(getNotificationPermissionState);
  const [isRequesting, setIsRequesting] = useState(false);

  const handleEnable = useCallback(async () => {
    setIsRequesting(true);
    try {
      const next = await requestCalendarNotificationPermission();
      setPermission(next);
      if (next === "granted") {
        await refreshCalendarReminderSchedule(storage);
      }
    } finally {
      setIsRequesting(false);
    }
  }, [storage]);

  if (permission === "granted" || permission === "unsupported") {
    return null;
  }

  return (
    <section className="rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] px-4 py-4">
      <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
        <IconLabel icon={APP_ICON.action.notify}>開啟手機通知</IconLabel>
      </p>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#86868b]">
        允許通知後，自己新增的行程與「會參加」的共用行程會依提醒時間跳出通知。建議將 Baki GO
        加入主畫面，通知更穩定。
      </p>
      {permission === "denied" ? (
        <p className="mt-3 text-[0.8125rem] text-[#ff375f]">
          通知已被封鎖，請到瀏覽器或手機設定中允許 Baki GO 的通知權限。
        </p>
      ) : (
        <button
          className="mt-3 rounded-xl bg-[var(--cal-primary)] px-4 py-2.5 text-[0.875rem] font-semibold text-white disabled:opacity-60"
          disabled={isRequesting}
          onClick={() => void handleEnable()}
          type="button"
        >
          {isRequesting ? "設定中…" : <IconLabel icon={APP_ICON.action.notify}>允許通知</IconLabel>}
        </button>
      )}
    </section>
  );
}
