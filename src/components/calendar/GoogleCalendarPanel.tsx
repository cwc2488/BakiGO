"use client";

import {
  clearGoogleCalendarConnection,
  fetchGoogleCalendarEvents,
  listGoogleCalendars,
  loadGoogleCalendarConnection,
  mapGoogleEventToLocal,
  saveGoogleCalendarConnection,
} from "@/lib/calendar/google-calendar";
import { DEFAULT_SHARED_GOOGLE_CALENDAR, SHARED_GOOGLE_CALENDARS } from "@/lib/calendar/shared-calendars";
import { syncSharedGoogleCalendars } from "@/lib/calendar/sync-shared-calendars";
import { addDays } from "@/lib/calendar/recurrence";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { GoogleCalendarConnection } from "@/types/calendar-event";
import type { CalendarEvent } from "@/types/calendar-event";
import { useCallback, useEffect, useMemo, useState } from "react";

function mergeCalendarOptions(
  remoteCalendars: Array<{ id: string; summary: string }>,
): Array<{ id: string; summary: string }> {
  const preset = SHARED_GOOGLE_CALENDARS.map((calendar) => ({
    id: calendar.id,
    summary: calendar.name,
  }));
  const merged = [...preset];
  for (const calendar of remoteCalendars) {
    if (!merged.some((item) => item.id === calendar.id)) {
      merged.push(calendar);
    }
  }
  return merged;
}

export function GoogleCalendarPanel({
  memberId,
  selectedDate,
  onSynced,
  onSharedEventsSynced,
  sharedSyncState = "idle",
  showSharedCalendar = true,
  onShowSharedCalendarChange,
}: {
  memberId: string;
  selectedDate: string;
  onSynced: () => void;
  onSharedEventsSynced?: (events: CalendarEvent[]) => void;
  sharedSyncState?: "idle" | "loading" | "done" | "error";
  showSharedCalendar?: boolean;
  onShowSharedCalendarChange?: (show: boolean) => void;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [connection, setConnection] = useState<GoogleCalendarConnection | null>(null);
  const [calendars, setCalendars] = useState<Array<{ id: string; summary: string }>>(
    SHARED_GOOGLE_CALENDARS.map((calendar) => ({ id: calendar.id, summary: calendar.name })),
  );
  const [selectedCalendarId, setSelectedCalendarId] = useState(DEFAULT_SHARED_GOOGLE_CALENDAR.id);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sharedSyncedAt, setSharedSyncedAt] = useState<string | null>(null);

  const refreshConnection = useCallback(() => {
    const current = loadGoogleCalendarConnection(storage);
    if (current?.selectedCalendarId) {
      setSelectedCalendarId(current.selectedCalendarId);
    }
    setConnection(current);
  }, [storage]);

  useEffect(() => {
    queueMicrotask(refreshConnection);
  }, [refreshConnection]);

  const syncSharedCalendars = useCallback(async () => {
    const rangeStart = addDays(selectedDate, -31);
    const rangeEnd = addDays(selectedDate, 31);
    const result = await syncSharedGoogleCalendars(storage, memberId, rangeStart, rangeEnd);
    setSharedSyncedAt(new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }));
    onSharedEventsSynced?.(result.events);
    onSynced();
    return result;
  }, [memberId, onSharedEventsSynced, onSynced, selectedDate, storage]);

  const loadCalendars = useCallback(async () => {
    if (!connection?.accessToken) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const items = await listGoogleCalendars(connection);
      const merged = mergeCalendarOptions(items.map((item) => ({ id: item.id, summary: item.summary })));
      setCalendars(merged);
      if (connection.selectedCalendarId) {
        setSelectedCalendarId(connection.selectedCalendarId);
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "無法讀取日曆");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  async function handleToggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && connection?.accessToken) {
      await loadCalendars();
    }
  }

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const sharedResult = await syncSharedCalendars();
      let googleCount = 0;

      if (
        connection?.accessToken &&
        selectedCalendarId &&
        selectedCalendarId !== DEFAULT_SHARED_GOOGLE_CALENDAR.id
      ) {
        const rangeStart = addDays(selectedDate, -31);
        const rangeEnd = addDays(selectedDate, 31);
        const googleEvents = await fetchGoogleCalendarEvents(
          connection,
          selectedCalendarId,
          rangeStart,
          rangeEnd,
        );
        const repository = createCalendarEventRepository(storage);
        googleEvents.forEach((item) => {
          repository.upsertGoogleEvent(mapGoogleEventToLocal(item, memberId, selectedCalendarId));
        });
        saveGoogleCalendarConnection(storage, connection);
        googleCount = googleEvents.length;
      }

      setMessage(
        googleCount > 0
          ? `已同步共用 ${sharedResult.count} 筆、Google ${googleCount} 筆`
          : `已同步共用行事曆 ${sharedResult.count} 筆`,
      );
      onSynced();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "同步失敗");
    } finally {
      setLoading(false);
    }
  }

  function handleDisconnect() {
    clearGoogleCalendarConnection(storage);
    setConnection(null);
    setSelectedCalendarId(DEFAULT_SHARED_GOOGLE_CALENDAR.id);
    setCalendars(
      SHARED_GOOGLE_CALENDARS.map((calendar) => ({ id: calendar.id, summary: calendar.name })),
    );
    setMessage("已中斷 Google 個人帳號連接（共用行事曆仍會自動載入）");
  }

  function handleSelectCalendar(calendarId: string) {
    setSelectedCalendarId(calendarId);
    if (!connection?.accessToken) {
      return;
    }
    const selected = calendars.find((item) => item.id === calendarId);
    const next = {
      ...connection,
      selectedCalendarId: calendarId,
      selectedCalendarName: selected?.summary,
    };
    saveGoogleCalendarConnection(storage, next);
    setConnection(next);
  }

  const selectedCalendarName =
    calendars.find((item) => item.id === selectedCalendarId)?.summary ??
    DEFAULT_SHARED_GOOGLE_CALENDAR.name;

  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-[var(--cal-border)] border-t-4 border-t-[var(--cal-primary)] bg-[var(--cal-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--cal-border)] px-4 py-3">
        <div>
          <p className="text-[0.9375rem] font-semibold text-[var(--cal-text)]">共用行事曆</p>
          <p className="mt-0.5 text-[0.8125rem] text-[var(--cal-text-muted)]">
            {showSharedCalendar ? "顯示中" : "已隱藏"}
            {sharedSyncState === "loading" ? " · 載入中…" : sharedSyncedAt ? ` · 更新 ${sharedSyncedAt}` : ""}
          </p>
        </div>
        <label className="inline-flex shrink-0 items-center gap-2">
          <span className="text-[0.8125rem] text-[#636366]">顯示</span>
          <input
            checked={showSharedCalendar}
            className="h-4 w-4 accent-[var(--cal-primary)]"
            onChange={(event) => onShowSharedCalendarChange?.(event.target.checked)}
            type="checkbox"
          />
        </label>
      </div>

      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => void handleToggleExpanded()}
        type="button"
      >
        <div>
          <p className="text-[0.875rem] font-medium text-[#1d1d1f]">{selectedCalendarName}</p>
          <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">點擊管理同步設定</p>
        </div>
        <span className="text-[0.8125rem] text-[var(--cal-primary-dark)]">{expanded ? "收合" : "設定"}</span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-[var(--cal-border)] px-4 py-4">
          <div className="rounded-xl bg-[var(--cal-primary-muted)] px-3 py-3">
            <p className="text-[0.875rem] font-medium text-[#1d1d1f]">
              {DEFAULT_SHARED_GOOGLE_CALENDAR.name}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#636366]">
              {DEFAULT_SHARED_GOOGLE_CALENDAR.description}
            </p>
            <a
              className="mt-2 inline-flex text-[0.8125rem] font-medium text-[var(--cal-primary-dark)]"
              href={DEFAULT_SHARED_GOOGLE_CALENDAR.embedUrl}
              rel="noreferrer"
              target="_blank"
            >
              在 Google 日曆中開啟
            </a>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[0.8125rem] font-medium text-[#636366]">同步來源</span>
            <select
              className="w-full rounded-xl border border-[var(--cal-border)] px-3 py-2.5 text-[0.9375rem]"
              onChange={(event) => handleSelectCalendar(event.target.value)}
              value={selectedCalendarId}
            >
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.summary}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-[var(--cal-primary)] px-4 py-2.5 text-[0.875rem] font-semibold text-white disabled:opacity-50"
              disabled={loading}
              onClick={() => void handleSync()}
              type="button"
            >
              {loading ? "同步中…" : "重新同步"}
            </button>
            {connection?.accessToken ? (
              <button
                className="rounded-xl border border-[var(--cal-border)] px-4 py-2.5 text-[0.875rem] font-medium text-[var(--cal-text-secondary)]"
                onClick={handleDisconnect}
                type="button"
              >
                中斷 Google 帳號
              </button>
            ) : (
              <a
                className="inline-flex rounded-xl border border-[var(--brand-border)] px-4 py-2.5 text-[0.875rem] font-medium text-[#636366]"
                href="/api/calendar/google/auth"
              >
                連接 Google 帳號
              </a>
            )}
          </div>

          {!connection?.accessToken ? (
            <p className="text-[0.8125rem] leading-relaxed text-[#636366]">
              共用行事曆已預先載入，無需登入 Google。若需同步個人日曆，可另外連接 Google 帳號。
            </p>
          ) : null}

          {message ? <p className="text-[0.8125rem] text-[#636366]">{message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
