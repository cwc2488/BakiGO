"use client";

import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine";
import { APP_IDS, todayISODate } from "@/lib/config/app-config";
import { getTransactionEventTypes } from "@/lib/event-center/event-types";
import { processEventForCurrentMember } from "@/lib/event-center/process-event";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { useCallback, useMemo, useState } from "react";

function getTransactionCurrencyCode(typeKey: string): string {
  const config = DEFAULT_BUSINESS_RULES.retailTransactionTypes.find(
    (type) => type.key === typeKey,
  );
  return config?.currencyCode ?? "TWD";
}

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
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedType = useMemo(
    () => transactionTypes.find((type) => type.key === eventTypeKey),
    [eventTypeKey, transactionTypes],
  );

  const handleSubmit = useCallback(
    (formEvent: React.FormEvent<HTMLFormElement>) => {
      formEvent.preventDefault();
      setError(null);

      if (!selectedType) {
        setError("請選擇成交類型");
        return;
      }

      const parsedValue = value.trim() ? Number(value) : undefined;
      if (!parsedValue || !Number.isFinite(parsedValue) || parsedValue <= 0) {
        setError(`請輸入有效的${selectedType.valueLabel ?? "數值"}`);
        return;
      }

      if (!customerName.trim()) {
        setError("請輸入姓名");
        return;
      }

      setIsSaving(true);

      try {
        const storage = createLocalStorageAdapter();
        const nextMetrics = processEventForCurrentMember(
          {
            eventTypeKey: selectedType.key,
            eventCategory: "transaction",
            eventDate,
            value: parsedValue,
            retailHouseKey: APP_IDS.defaultRetailHouseKey,
            metadata: {
              customerName: customerName.trim(),
              customerPhone: customerPhone.trim() || undefined,
              currencyCode: getTransactionCurrencyCode(selectedType.key),
              note: note.trim() || undefined,
            },
          },
          storage,
        );

        onMetricsChange(nextMetrics);
        setCustomerName("");
        setCustomerPhone("");
        setValue("");
        setNote("");
        setEventDate(todayISODate());
      } catch {
        setError("儲存失敗，請稍後再試");
      } finally {
        setIsSaving(false);
      }
    },
    [customerName, customerPhone, eventDate, note, onMetricsChange, selectedType, value],
  );

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
      <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">新增成交</h2>
      <p className="mt-1 text-[0.875rem] text-[#86868b]">成交紀錄由此登記，會同步更新零售屋與 VP。</p>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">類型</span>
          <select
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
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
          <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">日期</span>
          <input
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
            onChange={(event) => setEventDate(event.target.value)}
            required
            type="date"
            value={eventDate}
          />
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
            {selectedType?.valueLabel ?? "數值"}
          </span>
          <input
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
            inputMode="decimal"
            onChange={(event) => setValue(event.target.value)}
            required
            value={value}
          />
        </label>

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
