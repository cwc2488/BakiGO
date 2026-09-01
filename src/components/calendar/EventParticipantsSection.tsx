"use client";

import {
  MobileDismissibleSheet,
  MobileDismissibleSheetBody,
  MobileDismissibleSheetHandle,
} from "@/components/ui/MobileDismissibleSheet";
import { resolveParticipantCustomers } from "@/lib/calendar/calendar-event-participants";
import { searchCustomers } from "@/lib/customers/customer-search";
import type { Customer } from "@/types/customer";
import type { EntityId } from "@/types";
import Link from "next/link";
import { useMemo, useState } from "react";

type Props = {
  participantCustomerIds: EntityId[];
  customers: Customer[];
  /** When false, list is read-only (e.g. shared calendar events). */
  editable: boolean;
  onAdd: (customerId: EntityId) => void;
  onRemove: (customerId: EntityId) => void;
};

export function EventParticipantsSection({
  participantCustomerIds,
  customers,
  editable,
  onAdd,
  onRemove,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const participants = useMemo(
    () => resolveParticipantCustomers(participantCustomerIds, customers),
    [participantCustomerIds, customers],
  );

  const candidates = useMemo(() => {
    const linked = new Set(participantCustomerIds);
    const available = customers.filter((customer) => !linked.has(customer.id));
    return searchCustomers(available, search);
  }, [customers, participantCustomerIds, search]);

  return (
    <div className="mt-6 rounded-xl border border-[var(--cal-border)] bg-[var(--cal-surface)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">
          參加人員（{participants.length}）
        </p>
        {editable ? (
          <button
            className="rounded-full bg-[var(--cal-primary-muted)] px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--cal-primary-dark)]"
            onClick={() => setPickerOpen(true)}
            type="button"
          >
            ＋ 新增參加者
          </button>
        ) : null}
      </div>

      {participants.length === 0 ? (
        <p className="mt-2 text-[0.8125rem] text-[#86868b]">尚未加入顧客</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {participants.map((customer) => (
            <li
              className="flex items-center justify-between gap-3 rounded-xl bg-[var(--cal-primary-muted)] px-3 py-2.5"
              key={customer.id}
            >
              <Link
                className="min-w-0 truncate text-[0.875rem] font-medium text-[#1d1d1f]"
                href={`/customers/${customer.id}`}
              >
                {customer.displayName}
              </Link>
              {editable ? (
                <button
                  className="shrink-0 text-[0.75rem] font-semibold text-[#cf1322]"
                  onClick={() => onRemove(customer.id)}
                  type="button"
                >
                  移除
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {pickerOpen ? (
        <MobileDismissibleSheet onClose={() => setPickerOpen(false)} open={pickerOpen}>
          <MobileDismissibleSheetHandle />
          <div className="border-b border-[var(--cal-border)] px-4 pb-3 pt-1">
            <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">新增參加者</p>
            <input
              autoFocus
              className="mt-3 w-full rounded-2xl border border-[var(--cal-border)] bg-[var(--cal-surface)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--cal-primary)]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋顧客姓名、電話…"
              value={search}
            />
          </div>
          <MobileDismissibleSheetBody className="max-h-[min(55vh,26rem)] space-y-2 overflow-y-auto px-4 py-3">
            {candidates.length === 0 ? (
              <p className="py-6 text-center text-[0.9375rem] text-[#86868b]">找不到可加入的顧客</p>
            ) : (
              candidates.map((customer) => (
                <button
                  className="flex w-full flex-col items-start rounded-2xl border border-[var(--cal-border)] px-4 py-3 text-left active:bg-[var(--cal-primary-muted)]"
                  key={customer.id}
                  onClick={() => {
                    onAdd(customer.id);
                    setPickerOpen(false);
                    setSearch("");
                  }}
                  type="button"
                >
                  <span className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                    {customer.displayName}
                  </span>
                  {customer.phone ? (
                    <span className="mt-1 text-[0.8125rem] text-[#636366]">{customer.phone}</span>
                  ) : null}
                </button>
              ))
            )}
          </MobileDismissibleSheetBody>
          <div className="border-t border-[var(--cal-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <button
              className="w-full rounded-2xl bg-[var(--cal-primary-muted)] px-4 py-3.5 text-[0.9375rem] font-semibold text-[#1d1d1f]"
              onClick={() => setPickerOpen(false)}
              type="button"
            >
              取消
            </button>
          </div>
        </MobileDismissibleSheet>
      ) : null}
    </div>
  );
}
