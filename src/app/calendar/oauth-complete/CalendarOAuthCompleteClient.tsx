"use client";

import { decodeBase64Url } from "@/lib/calendar/base64url";
import { saveGoogleCalendarConnection } from "@/lib/calendar/google-calendar";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { GoogleCalendarConnection } from "@/types/calendar-event";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function CalendarOAuthCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [message, setMessage] = useState("正在完成 Google 日曆連接…");

  useEffect(() => {
    const payload = searchParams.get("payload");
    if (!payload) {
      queueMicrotask(() => setMessage("連接失敗，缺少授權資料"));
      return;
    }

    try {
      const connection = JSON.parse(decodeBase64Url(payload)) as GoogleCalendarConnection;
      saveGoogleCalendarConnection(storage, connection);
      router.replace("/calendar?google_connected=1");
    } catch {
      queueMicrotask(() => setMessage("連接失敗，無法解析授權資料"));
    }
  }, [router, searchParams, storage]);

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] px-6 text-[#86868b]">
      {message}
    </div>
  );
}
