"use client";

import { getTransactionEventTypes } from "@/lib/event-center/event-types";
import { parseGregorianDate } from "@/lib/retail-house/retail-house-gregorian-date";
import {
  deleteRetailTransactionForCurrentMember,
  updateRetailTransactionForCurrentMember,
} from "@/lib/retail-house/retail-transaction-service";
import { isCustomerTransactionType } from "@/lib/retail-house/resolve-transaction-points";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { RetailReportLineItem } from "@/types/retail-weekly-report";
import { MobileFormModal } from "@/components/ui/MobileFormModal";
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
  const [eventTypeKey, setEventTypeKey] = useState(item.transactionTypeKey);
  const [eventDate, setEventDate] = useState(item.transactionDate);
  const [customerName, setCustomerName] = useState(item.customerName);
  const [customerPhone, setCustomerPhone] = useState(item.customerPhone ?? "");
  const [value, setValue] = useState(String(item.amount));
  const [retailVp, setRetailVp] = useState(
    // Preserve 0 VP (教練課) — do not coerce zero to empty via truthy checks.
    item.points != null && Number.isFinite(item.points) ? String(item.points) : "",
  );
  const [note, setNote] = useState(item.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isCustomerType = isCustomerTransactionType(eventTypeKey);
  const selectedType = useMemo(
    () => transactionTypes.find((type) => type.key === eventTypeKey),
    [eventTypeKey, transactionTypes],
  );

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
          retailVp: isCustomerTransactionType(eventTypeKey) ? Number(retailVp) : undefined,
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
    <MobileFormModal
      footer={
        <div className="grid grid-cols-1 gap-3">
          <button
            className="rounded-2xl bg-[var(--brand-primary)] px-4 py-4 text-[1rem] font-semibold text-white disabled:opacity-60"
            disabled={loading}
            form="retail-transaction-edit-form"
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
      }
      onClose={onClose}
      open
      title="編輯成交"
    >
      <p className="mb-4 text-[0.8125rem] text-[#86868b]">日期使用西元年</p>

      <form
        className="space-y-4"
        id="retail-transaction-edit-form"
        onSubmit={handleSave}
      >
        <label className="block space-y-2">
          <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">類型</span>
          <select
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem]"
            onChange={(event) => {
              setEventTypeKey(event.target.value);
              if (!isCustomerTransactionType(event.target.value)) {
                setRetailVp("");
              }
            }}
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
            {isCustomerType ? "成交金額（NT$）" : (selectedType?.valueLabel ?? "VP")}
          </span>
          <input
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem]"
            inputMode="decimal"
            onChange={(event) => setValue(event.target.value)}
            required
            value={value}
          />
        </label>

        {isCustomerType ? (
          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">VP</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem]"
              inputMode="decimal"
              onChange={(event) => setRetailVp(event.target.value)}
              placeholder="自行填寫，不依金額推算"
              required
              value={retailVp}
            />
          </label>
        ) : null}

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
      </form>
    </MobileFormModal>
  );
}
