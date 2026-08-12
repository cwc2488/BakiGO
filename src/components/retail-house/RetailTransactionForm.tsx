"use client";

import { getTransactionEventTypes } from "@/lib/event-center/event-types";
import { parseGregorianDate } from "@/lib/retail-house/retail-house-gregorian-date";
import { createRetailTransactionForCurrentMember } from "@/lib/retail-house/retail-transaction-service";
import { isCustomerTransactionType } from "@/lib/retail-house/resolve-transaction-points";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { todayISODate } from "@/lib/config/app-config";
import { RetailGregorianDateFields } from "@/components/retail-house/RetailGregorianDateFields";
import { useCallback, useMemo, useState } from "react";

export function RetailTransactionForm({
  onMetricsChange,
}: {
  onMetricsChange: (metrics: MemberComputedMetrics) => void;
}) {
  const transactionTypes = useMemo(() => getTransactionEventTypes(), []);
  const [eventTypeKey, setEventTypeKey] = useState(transactionTypes[0]?.key ?? "");
  const [eventDate, setEventDate] = useState(todayISODate());
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [value, setValue] = useState("");
  const [retailVp, setRetailVp] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedType = useMemo(
    () => transactionTypes.find((type) => type.key === eventTypeKey),
    [eventTypeKey, transactionTypes],
  );
  const isCustomerType = isCustomerTransactionType(eventTypeKey);

  const handleSubmit = useCallback(
    (formEvent: React.FormEvent<HTMLFormElement>) => {
      formEvent.preventDefault();
      setError(null);
      setIsSaving(true);

      try {
        const storage = createLocalStorageAdapter();
        const nextMetrics = createRetailTransactionForCurrentMember(
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
        setCustomerName("");
        setCustomerPhone("");
        setValue("");
        setRetailVp("");
        setNote("");
        setEventDate(todayISODate());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "儲存失敗，請稍後再試");
      } finally {
        setIsSaving(false);
      }
    },
    [customerName, customerPhone, eventDate, eventTypeKey, note, onMetricsChange, retailVp, value],
  );

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
      <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">新增成交</h2>
      <p className="mt-1 text-[0.875rem] text-[#86868b]">
        成交紀錄由此登記，會同步更新零售屋。顧客成交請分別填寫成交金額與 VP（不可自動推算）。日期使用西元年。
      </p>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">類型</span>
          <select
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
            onChange={(event) => {
              setEventTypeKey(event.target.value);
              setRetailVp("");
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
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
            onChange={(event) => setCustomerName(event.target.value)}
            required
            value={customerName}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">電話</span>
          <input
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
            inputMode="tel"
            onChange={(event) => setCustomerPhone(event.target.value)}
            placeholder="選填"
            type="tel"
            value={customerPhone}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">
            {isCustomerType ? "成交金額（NT$）" : (selectedType?.valueLabel ?? "VP")}
          </span>
          <input
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
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
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              inputMode="decimal"
              onChange={(event) => setRetailVp(event.target.value)}
              placeholder="自行填寫，不依金額推算"
              required
              value={retailVp}
            />
          </label>
        ) : null}

        <label className="block space-y-2">
          <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">備註（選填）</span>
          <textarea
            className="min-h-[4rem] w-full rounded-2xl border border-[var(--brand-border)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </label>

        {error ? (
          <p className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-[0.9375rem] text-[#cf1322]">
            {error}
          </p>
        ) : null}

        <button
          className="w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-4 text-[1rem] font-semibold text-white disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "儲存中…" : "儲存成交"}
        </button>
      </form>
    </section>
  );
}
