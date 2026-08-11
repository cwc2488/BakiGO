"use client";

import { getTransactionEventTypes } from "@/lib/event-center/event-types";
import { parseGregorianDate } from "@/lib/retail-house/retail-house-gregorian-date";
import {
  deleteRetailTransactionForCurrentMember,
  updateRetailTransactionForCurrentMember,
} from "@/lib/retail-house/retail-transaction-service";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { RetailReportLineItem } from "@/types/retail-weekly-report";
import { RetailGregorianDateFields } from "@/components/retail-house/RetailGregorianDateFields";
import { useMemo, useState } from "react";

export function RetailTransactionEditSheet({
  item,
  onClose,
  onMetricsChange,
}: {
  item: RetailReportLineItem;
  onClose: () => void;
  onMetricsChange: (metrics: MemberComputedMetrics) => void;
}) {
  const transactionTypes = useMemo(() => getTransactionEventTypes(), []);
  const selectedType = useMemo(
    () => transactionTypes.find((type) => type.key === item.transactionTypeKey),
    [item.transactionTypeKey, transactionTypes],
  );

  const [eventTypeKey, setEventTypeKey] = useState(item.transactionTypeKey);
  const [eventDate, setEventDate] = useState(item.transactionDate);
  const [customerName, setCustomerName] = useState(item.customerName);
  const [customerPhone, setCustomerPhone] = useState(item.customerPhone ?? "");
  const [value, setValue] = useState(String(item.amount));
  const [note, setNote] = useState(item.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const storage = createLocalStorageAdapter();
      const nextMetrics = updateRetailTransactionForCurrentMember(
        item.transactionId,
        {
          eventTypeKey,
          dateParts: parseGregorianDate(eventDate),
          customerName,
          customerPhone,
          value: Number(value),
          note,
        },
        storage,
      );
      onMetricsChange(nextMetrics);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "儲存失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("確定要刪除這筆成交紀錄？")) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const storage = createLocalStorageAdapter();
      const nextMetrics = deleteRetailTransactionForCurrentMember(
        item.transactionId,
        storage,
      );
      onMetricsChange(nextMetrics);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "刪除失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">編輯成交</h2>
            <p className="mt-1 text-[0.8125rem] text-[#86868b]">日期使用西元年</p>
          </div>
          <button
            className="rounded-xl px-3 py-2 text-[0.875rem] text-[#86868b]"
            onClick={onClose}
            type="button"
          >
            關閉
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSave}>
          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">類型</span>
            <select
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem]"
              onChange={(event) => setEventTypeKey(event.target.value)}
              value={eventTypeKey}
            >
              {transactionTypes.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">日期（西元）</span>
            <RetailGregorianDateFields onChange={setEventDate} value={eventDate} />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">姓名</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem]"
              onChange={(event) => setCustomerName(event.target.value)}
              required
              value={customerName}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">電話</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem]"
              onChange={(event) => setCustomerPhone(event.target.value)}
              type="tel"
              value={customerPhone}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">
              {selectedType?.valueLabel ?? "數值"}
            </span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem]"
              inputMode="decimal"
              onChange={(event) => setValue(event.target.value)}
              required
              value={value}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">備註</span>
            <textarea
              className="min-h-[4rem] w-full rounded-2xl border border-[var(--brand-border)] px-4 py-3.5 text-[1rem]"
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </label>

          {error ? (
            <p className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-[0.9375rem] text-[#cf1322]">
              {error}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              className="rounded-2xl bg-[var(--brand-primary)] px-4 py-4 text-[1rem] font-semibold text-white disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "儲存中…" : "儲存修改"}
            </button>
            <button
              className="rounded-2xl border border-[#ffd6d6] bg-[#fff5f5] px-4 py-4 text-[1rem] font-semibold text-[#cf1322] disabled:opacity-60"
              disabled={loading}
              onClick={handleDelete}
              type="button"
            >
              刪除
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
