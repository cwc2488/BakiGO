"use client";

import { isCalendarGoogleEventDeleted } from "@/lib/calendar/calendar-google-deletion-tombstones";
import {
  clearGoogleCalendarConnection,
  fetchGoogleCalendarEvents,
  listGoogleCalendars,
  loadGoogleCalendarConnection,
  mapGoogleEventToLocal,
  pickDefaultPersonalCalendar,
  saveGoogleCalendarConnection,
} from "@/lib/calendar/google-calendar";
import { PERSONAL_GOOGLE_CALENDAR_ENABLED } from "@/lib/calendar/calendar-features";
import { DEFAULT_SHARED_GOOGLE_CALENDAR, isSharedGoogleCalendarId } from "@/lib/calendar/shared-calendars";
import { getSharedCalendarSyncRange, syncSharedGoogleCalendars } from "@/lib/calendar/sync-shared-calendars";
import { addDays } from "@/lib/calendar/recurrence";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { GoogleCalendarConnection } from "@/types/calendar-event";
import type { CalendarEvent } from "@/types/calendar-event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const INITIAL_SYNC_KEY = "baki-go:google-calendar-initial-sync";

function isPersonalCalendarSelection(calendarId: string | undefined): boolean {
  return Boolean(calendarId && !isSharedGoogleCalendarId(calendarId));
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
  const [personalCalendars, setPersonalCalendars] = useState<Array<{ id: string; summary: string }>>(
    [],
  );
  const [selectedCalendarId, setSelectedCalendarId] = useState(DEFAULT_SHARED_GOOGLE_CALENDAR.id);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sharedSyncedAt, setSharedSyncedAt] = useState<string | null>(null);
  const setupAttemptedRef = useRef(false);

  const refreshConnection = useCallback(() => {
    const current = loadGoogleCalendarConnection(storage);
    if (current?.selectedCalendarId && isPersonalCalendarSelection(current.selectedCalendarId)) {
      setSelectedCalendarId(current.selectedCalendarId);
    } else if (current?.accessToken) {
      setSelectedCalendarId("");
    } else {
      setSelectedCalendarId(DEFAULT_SHARED_GOOGLE_CALENDAR.id);
    }
    setConnection(current);
  }, [storage]);

  useEffect(() => {
    queueMicrotask(refreshConnection);
  }, [refreshConnection]);

  const syncSharedCalendars = useCallback(async (force = false) => {
    const { rangeStart, rangeEnd } = getSharedCalendarSyncRange(selectedDate);
    const result = await syncSharedGoogleCalendars(storage, memberId, rangeStart, rangeEnd, { force });
    setSharedSyncedAt(new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }));
    onSharedEventsSynced?.(result.events);
    onSynced();
    return result;
  }, [memberId, onSharedEventsSynced, onSynced, selectedDate, storage]);

  const saveCalendarSelection = useCallback(
    (calendarId: string, calendars: Array<{ id: string; summary: string }>, current: GoogleCalendarConnection) => {
      const selected = calendars.find((item) => item.id === calendarId);
      const next = {
        ...current,
        selectedCalendarId: calendarId,
        selectedCalendarName: selected?.summary,
      };
      saveGoogleCalendarConnection(storage, next);
      setConnection(next);
      setSelectedCalendarId(calendarId);
    },
    [storage],
  );

  const syncPersonalCalendar = useCallback(
    async (current: GoogleCalendarConnection, calendarId: string) => {
      const rangeStart = addDays(selectedDate, -31);
      const rangeEnd = addDays(selectedDate, 31);
      const googleEvents = await fetchGoogleCalendarEvents(
        current,
        calendarId,
        rangeStart,
        rangeEnd,
        storage,
      );
      const repository = createCalendarEventRepository(storage);
      googleEvents.forEach((item) => {
        if (isCalendarGoogleEventDeleted(storage, item.id, calendarId)) {
          return;
        }
        repository.upsertGoogleEvent(mapGoogleEventToLocal(item, memberId, calendarId));
      });
      saveGoogleCalendarConnection(storage, current);
      return googleEvents.length;
    },
    [memberId, selectedDate, storage],
  );

  const ensurePersonalCalendarReady = useCallback(async () => {
    const current = loadGoogleCalendarConnection(storage);
    if (!current?.accessToken) {
      return null;
    }

    setLoading(true);
    setMessage(null);
    try {
      const items = await listGoogleCalendars(current, storage);
      const remote = items.map((item) => ({
        id: item.id,
        summary: item.summary?.trim() || "Google 日曆",
      }));
      setPersonalCalendars(remote);

      let calendarId = current.selectedCalendarId;
      if (!isPersonalCalendarSelection(calendarId)) {
        const primary = pickDefaultPersonalCalendar(items);
        calendarId = primary?.id;
        if (calendarId) {
          saveCalendarSelection(calendarId, remote, current);
        }
      } else {
        setSelectedCalendarId(calendarId!);
      }

      return calendarId ? { connection: loadGoogleCalendarConnection(storage)!, calendarId } : null;
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "無法讀取 Google 日曆");
      return null;
    } finally {
      setLoading(false);
    }
  }, [saveCalendarSelection, storage]);

  useEffect(() => {
    if (!PERSONAL_GOOGLE_CALENDAR_ENABLED || !connection?.accessToken || setupAttemptedRef.current) {
      return;
    }
    setupAttemptedRef.current = true;
    void ensurePersonalCalendarReady();
  }, [connection?.accessToken, ensurePersonalCalendarReady]);

  useEffect(() => {
    if (!PERSONAL_GOOGLE_CALENDAR_ENABLED || !connection?.accessToken || typeof window === "undefined") {
      return;
    }
    if (sessionStorage.getItem(INITIAL_SYNC_KEY) !== "1") {
      return;
    }
    sessionStorage.removeItem(INITIAL_SYNC_KEY);

    void (async () => {
      setLoading(true);
      setMessage(null);
      try {
        const ready = await ensurePersonalCalendarReady();
        const sharedResult = await syncSharedCalendars(true);
        let googleCount = 0;
        if (ready) {
          googleCount = await syncPersonalCalendar(ready.connection, ready.calendarId);
        }
        setMessage(
          googleCount > 0
            ? `已連接 ${ready?.connection.email ?? "Google 帳號"}，同步共用 ${sharedResult.count} 筆、個人 ${googleCount} 筆`
            : `已連接 ${ready?.connection.email ?? "Google 帳號"}，同步共用 ${sharedResult.count} 筆`,
        );
        onSynced();
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "初次同步失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [connection?.accessToken, ensurePersonalCalendarReady, onSynced, syncPersonalCalendar, syncSharedCalendars]);

  async function handleToggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (PERSONAL_GOOGLE_CALENDAR_ENABLED && next && connection?.accessToken) {
      await ensurePersonalCalendarReady();
    }
  }

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const sharedResult = await syncSharedCalendars(true);
      let googleCount = 0;

      if (PERSONAL_GOOGLE_CALENDAR_ENABLED) {
        if (connection?.accessToken && isPersonalCalendarSelection(selectedCalendarId)) {
          googleCount = await syncPersonalCalendar(connection, selectedCalendarId);
        } else if (connection?.accessToken) {
          const ready = await ensurePersonalCalendarReady();
          if (ready) {
            googleCount = await syncPersonalCalendar(ready.connection, ready.calendarId);
          }
        }
      }

      setMessage(
        googleCount > 0
          ? `已同步共用 ${sharedResult.count} 筆、個人 Google ${googleCount} 筆`
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
    setPersonalCalendars([]);
    setSelectedCalendarId(DEFAULT_SHARED_GOOGLE_CALENDAR.id);
    setupAttemptedRef.current = false;
    setMessage("已中斷 Google 個人帳號連接（共用行事曆仍會自動載入）");
  }

  function handleSelectCalendar(calendarId: string) {
    setSelectedCalendarId(calendarId);
    if (!connection?.accessToken || isSharedGoogleCalendarId(calendarId)) {
      return;
    }
    saveCalendarSelection(calendarId, personalCalendars, connection);
  }

  const selectedCalendarName = DEFAULT_SHARED_GOOGLE_CALENDAR.name;

  const connectionSummary = DEFAULT_SHARED_GOOGLE_CALENDAR.description;

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
        <div className="min-w-0">
          <p className="truncate text-[0.875rem] font-medium text-[#1d1d1f]">{selectedCalendarName}</p>
          <p className="mt-0.5 truncate text-[0.8125rem] text-[#86868b]">{connectionSummary}</p>
        </div>
        <span className="shrink-0 text-[0.8125rem] text-[var(--cal-primary-dark)]">{expanded ? "收合" : "設定"}</span>
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

          {PERSONAL_GOOGLE_CALENDAR_ENABLED && connection?.accessToken ? (
            <div className="rounded-xl border border-[var(--cal-border)] bg-[var(--brand-bg)] px-3 py-3">
              <p className="text-[0.8125rem] font-medium text-[#636366]">已連接的 Google 帳號</p>
              <p className="mt-1 text-[0.9375rem] font-semibold text-[#1d1d1f]">
                {connection.email ?? "（無法讀取電郵）"}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#86868b]">
                若有多個 Google 帳號，請先中斷再重新連接，並在 Google 畫面選擇正確帳號。
              </p>
            </div>
          ) : null}

          {PERSONAL_GOOGLE_CALENDAR_ENABLED ? (
            <label className="block space-y-1.5">
              <span className="text-[0.8125rem] font-medium text-[#636366]">個人 Google 日曆（雙向同步）</span>
              {connection?.accessToken ? (
                <select
                  className="w-full rounded-xl border border-[var(--cal-border)] px-3 py-2.5 text-[0.9375rem]"
                  onChange={(event) => handleSelectCalendar(event.target.value)}
                  value={isPersonalCalendarSelection(selectedCalendarId) ? selectedCalendarId : ""}
                >
                  <option disabled value="">
                    請選擇要同步的個人日曆
                  </option>
                  {personalCalendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.summary}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--cal-border)] px-3 py-2.5 text-[0.8125rem] text-[#86868b]">
                  連接 Google 帳號後，可選擇個人日曆並雙向同步行程。
                </p>
              )}
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-[var(--cal-primary)] px-4 py-2.5 text-[0.875rem] font-semibold text-white disabled:opacity-50"
              disabled={loading}
              onClick={() => void handleSync()}
              type="button"
            >
              {loading ? "同步中…" : "重新同步"}
            </button>
            {PERSONAL_GOOGLE_CALENDAR_ENABLED && connection?.accessToken ? (
              <button
                className="rounded-xl border border-[var(--cal-border)] px-4 py-2.5 text-[0.875rem] font-medium text-[var(--cal-text-secondary)]"
                onClick={handleDisconnect}
                type="button"
              >
                中斷 Google 帳號
              </button>
            ) : null}
          </div>

          {message ? <p className="text-[0.8125rem] text-[#636366]">{message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
