"use client";

import {
  MobileDismissibleSheet,
  MobileDismissibleSheetBody,
  MobileDismissibleSheetHandle,
} from "@/components/ui/MobileDismissibleSheet";
import {
  buildDefaultFormValues,
  EventFormModal,
  formValuesToPayload,
  validateEventFormValues,
  type EventFormValues,
} from "@/components/calendar/EventFormModal";
import {
  listLinkableUpcomingEvents,
  listUpcomingEventsForCustomer,
} from "@/lib/calendar/calendar-event-participants";
import { defaultRecurrence } from "@/lib/calendar/recurrence";
import { todayISODate } from "@/lib/config/app-config";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { awaitPendingCloudSync } from "@/lib/repositories/syncing-storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CalendarEvent } from "@/types/calendar-event";
import type { Customer } from "@/types/customer";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  customer: Customer;
  storage: StorageAdapter;
  memberId: string;
  onChanged?: () => void;
};

export function CustomerNextActivitySection({
  customer,
  storage,
  memberId,
  onChanged,
}: Props) {
  const calendarRepo = useMemo(() => createCalendarEventRepository(storage), [storage]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<EventFormValues>(() =>
    buildDefaultFormValues(todayISODate()),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setEvents(calendarRepo.getByMemberId(memberId));
  }, [calendarRepo, memberId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const nowIso = useMemo(() => new Date().toISOString().slice(0, 16), [events]);
  const linked = useMemo(
    () => listUpcomingEventsForCustomer(events, customer.id, nowIso),
    [events, customer.id, nowIso],
  );
  const linkable = useMemo(() => {
    const all = listLinkableUpcomingEvents(events, customer.id, nowIso);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (event) =>
        event.title.toLowerCase().includes(q) ||
        event.categoryLabel.toLowerCase().includes(q) ||
        event.dateLabel.includes(q),
    );
  }, [events, customer.id, nowIso, search]);

  async function linkEvent(eventId: string) {
    if (customer.ownerMemberId !== memberId) {
      setStatusMessage("無權限將此顧客加入活動");
      return;
    }
    calendarRepo.addParticipant(eventId, customer.id);
    await awaitPendingCloudSync();
    reload();
    onChanged?.();
    setPickerOpen(false);
    setSearch("");
    setStatusMessage("已加入下次活動");
  }

  async function unlinkEvent(eventId: string) {
    calendarRepo.removeParticipant(eventId, customer.id);
    await awaitPendingCloudSync();
    reload();
    onChanged?.();
    setStatusMessage("已移除活動連結");
  }

  async function handleCreateEvent() {
    const error = validateEventFormValues(formValues);
    if (error) {
      setFormError(error);
      return;
    }
    if (customer.ownerMemberId !== memberId) {
      setFormError("無權限為此顧客建立活動");
      return;
    }
    const payload = formValuesToPayload(formValues);
    const created = calendarRepo.create({
      memberId,
      ...payload,
      recurrence: payload.recurrence ?? defaultRecurrence(),
      participantCustomerIds: [customer.id],
    });
    await awaitPendingCloudSync();
    reload();
    onChanged?.();
    setCreateOpen(false);
    setFormError(null);
    setFormValues(buildDefaultFormValues(todayISODate()));
    setStatusMessage(`已建立「${created.title}」並加入參加者`);
  }

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
            下次活動
          </p>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">連結行事曆活動，雙方同步顯示</p>
        </div>
      </div>

      {linked.length === 0 ? (
        <p className="mt-4 text-[0.9375rem] text-[#86868b]">尚未安排下次活動</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {linked.map((event) => (
            <li
              className="flex items-start justify-between gap-3 rounded-2xl bg-[var(--brand-bg)] px-4 py-3"
              key={event.eventId}
            >
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-semibold text-[#1d1d1f]">
                  {event.title}
                </p>
                <p className="mt-1 text-[0.8125rem] text-[#636366]">
                  {event.dateLabel} · {event.timeLabel} · {event.categoryLabel}
                </p>
                <Link
                  className="mt-2 inline-block text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
                  href="/calendar"
                >
                  在行事曆查看
                </Link>
              </div>
              <button
                className="shrink-0 rounded-full bg-[#fff1f0] px-3 py-1.5 text-[0.75rem] font-semibold text-[#cf1322]"
                onClick={() => void unlinkEvent(event.eventId)}
                type="button"
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3 text-[0.9375rem] font-semibold text-[var(--brand-primary-dark)]"
          onClick={() => setPickerOpen(true)}
          type="button"
        >
          選擇既有活動
        </button>
        <button
          className="rounded-2xl bg-[#1d1d1f] px-4 py-3 text-[0.9375rem] font-semibold text-white"
          onClick={() => {
            setFormValues(buildDefaultFormValues(todayISODate()));
            setFormError(null);
            setCreateOpen(true);
          }}
          type="button"
        >
          新增活動
        </button>
      </div>

      {statusMessage ? (
        <p className="mt-3 text-[0.8125rem] text-[var(--brand-primary-dark)]">{statusMessage}</p>
      ) : null}

      {pickerOpen ? (
        <MobileDismissibleSheet onClose={() => setPickerOpen(false)} open={pickerOpen}>
          <MobileDismissibleSheetHandle />
          <div className="border-b border-[var(--brand-border)] px-4 pb-3 pt-1">
            <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">選擇下次活動</p>
            <input
              className="mt-3 w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋活動名稱、分類…"
              value={search}
            />
          </div>
          <MobileDismissibleSheetBody className="max-h-[min(60vh,28rem)] space-y-2 overflow-y-auto px-4 py-3">
            {linkable.length === 0 ? (
              <p className="py-6 text-center text-[0.9375rem] text-[#86868b]">
                沒有可選的即將到來活動
              </p>
            ) : (
              linkable.map((event) => (
                <button
                  className="flex w-full flex-col items-start rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-left active:bg-[var(--brand-bg)]"
                  key={event.eventId}
                  onClick={() => void linkEvent(event.eventId)}
                  type="button"
                >
                  <span className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                    {event.title}
                  </span>
                  <span className="mt-1 text-[0.8125rem] text-[#636366]">
                    {event.dateLabel} · {event.timeLabel} · {event.categoryLabel}
                  </span>
                </button>
              ))
            )}
          </MobileDismissibleSheetBody>
          <div className="border-t border-[var(--brand-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <button
              className="w-full rounded-2xl bg-[var(--brand-bg)] px-4 py-3.5 text-[0.9375rem] font-semibold text-[#1d1d1f]"
              onClick={() => setPickerOpen(false)}
              type="button"
            >
              取消
            </button>
          </div>
        </MobileDismissibleSheet>
      ) : null}

      {formError && createOpen ? (
        <p className="mt-2 text-[0.8125rem] text-[#cf1322]">{formError}</p>
      ) : null}

      {createOpen ? (
        <EventFormModal
          mode="create"
          onChange={setFormValues}
          onClose={() => {
            setCreateOpen(false);
            setFormError(null);
          }}
          onSubmit={() => void handleCreateEvent()}
          open={createOpen}
          values={formValues}
        />
      ) : null}
    </section>
  );
}
