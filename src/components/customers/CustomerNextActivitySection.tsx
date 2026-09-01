"use client";

import {
  buildDefaultFormValues,
  EventFormModal,
  formValuesToPayload,
  validateEventFormValues,
  type EventFormValues,
} from "@/components/calendar/EventFormModal";
import { NextActivityPickerSheet } from "@/components/customers/NextActivityPickerSheet";
import {
  addAllianceEventParticipant,
  removeAllianceEventParticipant,
} from "@/lib/calendar/alliance-event-participants";
import { listLinkableNextActivityItems, listLinkedNextActivityItems } from "@/lib/calendar/next-activity-picker";
import { defaultRecurrence } from "@/lib/calendar/recurrence";
import { loadSharedCalendarEvents } from "@/lib/calendar/shared-calendar-storage";
import { todayISODate } from "@/lib/config/app-config";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { awaitPendingCloudSync } from "@/lib/repositories/syncing-storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CalendarEvent } from "@/types/calendar-event";
import type { Customer } from "@/types/customer";
import type { NextActivityPickerItem } from "@/lib/calendar/next-activity-picker";
import { CALENDAR_EVENT_SOURCE } from "@/types/calendar-event-participant";
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
  const [personalEvents, setPersonalEvents] = useState<CalendarEvent[]>([]);
  const [sharedEvents, setSharedEvents] = useState<CalendarEvent[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<EventFormValues>(() =>
    buildDefaultFormValues(todayISODate()),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setPersonalEvents(calendarRepo.getByMemberId(memberId));
    setSharedEvents(loadSharedCalendarEvents(storage));
    setTick((value) => value + 1);
  }, [calendarRepo, memberId, storage]);

  useEffect(() => {
    reload();
  }, [reload]);

  const nowIso = useMemo(() => new Date().toISOString().slice(0, 16), [personalEvents, sharedEvents, tick]);

  const linked = useMemo(
    () =>
      listLinkedNextActivityItems({
        personalEvents,
        sharedEvents,
        storage,
        ownerMemberId: memberId,
        customerId: customer.id,
        nowIso,
      }),
    [personalEvents, sharedEvents, storage, memberId, customer.id, nowIso, tick],
  );

  const linkable = useMemo(
    () =>
      listLinkableNextActivityItems({
        personalEvents,
        sharedEvents,
        storage,
        ownerMemberId: memberId,
        customerId: customer.id,
        nowIso,
      }),
    [personalEvents, sharedEvents, storage, memberId, customer.id, nowIso, tick],
  );

  async function linkItem(item: NextActivityPickerItem) {
    if (customer.ownerMemberId !== memberId) {
      setStatusMessage("無權限將此顧客加入活動");
      return;
    }
    if (item.eventSource === CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED) {
      addAllianceEventParticipant(storage, {
        ownerMemberId: memberId,
        eventId: item.eventId,
        customerId: customer.id,
      });
    } else {
      calendarRepo.addParticipant(item.eventId, customer.id);
    }
    await awaitPendingCloudSync();
    reload();
    onChanged?.();
    setPickerOpen(false);
    setStatusMessage("已加入下次活動");
  }

  async function unlinkItem(item: NextActivityPickerItem) {
    if (item.eventSource === CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED) {
      removeAllianceEventParticipant(storage, {
        ownerMemberId: memberId,
        eventId: item.eventId,
        customerId: customer.id,
      });
    } else {
      calendarRepo.removeParticipant(item.eventId, customer.id);
    }
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
      <div>
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
          下次活動
        </p>
        <p className="mt-1 text-[0.8125rem] text-[#86868b]">連結行事曆活動，雙方同步顯示</p>
      </div>

      {linked.length === 0 ? (
        <p className="mt-4 text-[0.9375rem] text-[#86868b]">尚未安排下次活動</p>
      ) : (
        <ul className="mt-4 divide-y divide-[#f2f2f7] overflow-hidden rounded-2xl bg-[var(--brand-bg)]">
          {linked.map((event) => (
            <li
              className="flex items-start justify-between gap-3 px-4 py-3"
              key={`${event.eventSource}:${event.eventId}`}
            >
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-semibold text-[#1d1d1f]">
                  {event.title}
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-[#636366]">
                  {event.dateLabel} · {event.timeLabel}
                </p>
                <p className="mt-0.5 text-[0.75rem] text-[#8e8e93]">
                  {event.categoryLabel}
                  <span
                    className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                      event.eventSource === "alliance_shared"
                        ? "bg-[#eef6ee] text-[#3d8b40]"
                        : "bg-[#ebebec] text-[#636366]"
                    }`}
                  >
                    {event.sourceLabel}
                  </span>
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
                onClick={() => void unlinkItem(event)}
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

      <NextActivityPickerSheet
        items={linkable}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => void linkItem(item)}
        open={pickerOpen}
      />

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
