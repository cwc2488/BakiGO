"use client";

import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine";
import {
  APP_IDS,
  todayISODate,
} from "@/lib/config/app-config";
import { processEventForCurrentMember } from "@/lib/event-center/process-event";
import {
  getEventTypeDefinition,
  getEventTypesByCategory,
} from "@/lib/event-center/event-types";
import {
  formatShortDate,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { BakiEventCategory } from "@/types/baki-event";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const CATEGORY_LABELS: Record<BakiEventCategory, string> = {
  transaction: "成交",
  activity: "活動",
  qualification: "資格",
};

function getTransactionCurrencyCode(typeKey: string): string {
  const config = DEFAULT_BUSINESS_RULES.retailTransactionTypes.find(
    (type) => type.key === typeKey,
  );
  return config?.currencyCode ?? "TWD";
}

export default function EventCenterPage() {
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [category, setCategory] = useState<BakiEventCategory>("transaction");
  const [eventTypeKey, setEventTypeKey] = useState(
    getEventTypesByCategory("transaction")[0]?.key ?? "",
  );
  const [eventDate, setEventDate] = useState(todayISODate());
  const [customerName, setCustomerName] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadMetrics = useCallback(() => {
    setLoadState("loading");
    try {
      setMetrics(loadMissionControlMetrics());
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const eventTypes = useMemo(() => getEventTypesByCategory(category), [category]);
  const selectedType = useMemo(
    () => getEventTypeDefinition(eventTypeKey),
    [eventTypeKey],
  );

  useEffect(() => {
    const firstType = getEventTypesByCategory(category)[0];
    if (firstType) {
      setEventTypeKey(firstType.key);
    }
  }, [category]);

  function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    if (!selectedType) {
      setError("請選擇 Event 類型");
      return;
    }

    const parsedValue = value.trim() ? Number(value) : undefined;

    if (selectedType.requiresValue) {
      if (!parsedValue || !Number.isFinite(parsedValue) || parsedValue <= 0) {
        setError(`請輸入有效的${selectedType.valueLabel ?? "數值"}`);
        return;
      }
    }

    if (selectedType.requiresCustomerName && !customerName.trim()) {
      setError("請輸入姓名");
      return;
    }

    setIsSaving(true);

    try {
      const storage = createLocalStorageAdapter();
      const nextMetrics = processEventForCurrentMember(
        {
          eventTypeKey: selectedType.key,
          eventCategory: selectedType.category,
          eventDate,
          value: parsedValue,
          retailHouseKey: APP_IDS.defaultRetailHouseKey,
          metadata:
            selectedType.category === "transaction"
              ? {
                  customerName: customerName.trim(),
                  currencyCode: getTransactionCurrencyCode(selectedType.key),
                  note: note.trim() || undefined,
                }
              : note.trim()
                ? { note: note.trim() }
                : undefined,
        },
        storage,
      );

      setMetrics(nextMetrics);
      setCustomerName("");
      setValue("");
      setNote("");
      setEventDate(todayISODate());
    } catch {
      setError("儲存失敗，請稍後再試");
    } finally {
      setIsSaving(false);
    }
  }

  if (loadState === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center bg-white text-[#86868b]">
        載入中…
      </div>
    );
  }

  if (loadState === "error" || !metrics) {
    return (
      <div className="flex min-h-full items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm rounded-[1.75rem] border border-[#ececf1] p-8 text-center">
          <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">無法載入 Event Center</p>
          <button
            className="mt-6 w-full rounded-2xl bg-[#0071e3] px-4 py-3.5 text-[1rem] font-semibold text-white"
            onClick={loadMetrics}
            type="button"
          >
            重新載入
          </button>
        </div>
      </div>
    );
  }

  const timeline = metrics.eventCenter.events;

  return (
    <div className="min-h-full bg-white">
      <main className="profile-container flex flex-col gap-6 pb-24 pt-10 sm:pt-12">
        <header className="space-y-3">
          <Link
            className="inline-flex text-[0.875rem] font-medium text-[#0071e3]"
            href="/"
          >
            ← 返回首頁
          </Link>
          <h1 className="text-[2rem] font-semibold tracking-tight text-[#1d1d1f] sm:text-[2.25rem]">
            Event Center
          </h1>
          <p className="text-[1.0625rem] text-[#86868b]">
            所有輸入從這裡進入，Engine 自動推導全系統。
          </p>
        </header>

        <section className="rounded-[1.75rem] border border-[#ececf1] bg-white p-6 sm:p-7">
          <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
            新增 Event
          </h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(CATEGORY_LABELS) as BakiEventCategory[]).map((item) => (
              <button
                key={item}
                className={`rounded-full px-4 py-2 text-[0.875rem] font-medium transition-colors duration-200 ${
                  category === item
                    ? "bg-[#1d1d1f] text-white"
                    : "bg-[#f5f5f7] text-[#636366] hover:bg-[#ececf1]"
                }`}
                onClick={() => setCategory(item)}
                type="button"
              >
                {CATEGORY_LABELS[item]}
              </button>
            ))}
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <fieldset className="space-y-3">
              <legend className="text-[0.9375rem] font-medium text-[#1d1d1f]">類型</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {eventTypes.map((type) => (
                  <label
                    key={type.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 ${
                      eventTypeKey === type.key
                        ? "border-[#0071e3] bg-[#eef8ff]"
                        : "border-[#ececf1] bg-white"
                    }`}
                  >
                    <input
                      checked={eventTypeKey === type.key}
                      className="mt-1 h-4 w-4 accent-[#0071e3]"
                      name="eventType"
                      onChange={() => setEventTypeKey(type.key)}
                      type="radio"
                      value={type.key}
                    />
                    <span>
                      <span className="block text-[1rem] font-medium text-[#1d1d1f]">
                        {type.label}
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] text-[#86868b]">
                        {type.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-2">
              <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">日期</span>
              <input
                className="w-full rounded-2xl border border-[#ececf1] px-4 py-3.5 text-[1rem] outline-none focus:border-[#0071e3]"
                onChange={(event) => setEventDate(event.target.value)}
                type="date"
                value={eventDate}
              />
            </label>

            {selectedType?.requiresCustomerName ? (
              <label className="block space-y-2">
                <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">姓名</span>
                <input
                  className="w-full rounded-2xl border border-[#ececf1] px-4 py-3.5 text-[1rem] outline-none focus:border-[#0071e3]"
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="請輸入姓名"
                  type="text"
                  value={customerName}
                />
              </label>
            ) : null}

            {selectedType?.requiresValue ? (
              <label className="block space-y-2">
                <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">
                  {selectedType.valueLabel}
                </span>
                <input
                  className="w-full rounded-2xl border border-[#ececf1] px-4 py-3.5 text-[1rem] outline-none focus:border-[#0071e3]"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setValue(event.target.value)}
                  step="any"
                  type="number"
                  value={value}
                />
              </label>
            ) : null}

            <label className="block space-y-2">
              <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">備註（選填）</span>
              <textarea
                className="min-h-[5rem] w-full rounded-2xl border border-[#ececf1] px-4 py-3.5 text-[1rem] outline-none focus:border-[#0071e3]"
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
              className="w-full rounded-2xl bg-[#0071e3] px-4 py-4 text-[1.0625rem] font-semibold text-white disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "儲存中…" : "新增 Event"}
            </button>
          </form>
        </section>

        <section className="rounded-[1.75rem] border border-[#ececf1] bg-white p-6 sm:p-7">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
              Event Timeline
            </h2>
            <span className="text-[0.875rem] text-[#86868b]">
              {metrics.eventCenter.totalEventCount} 筆
            </span>
          </div>

          <div className="mt-4">
            {timeline.length > 0 ? (
              <ol className="space-y-0">
                {timeline.map((event, index) => (
                  <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {index < timeline.length - 1 ? (
                      <span
                        aria-hidden
                        className="absolute left-[0.6875rem] top-6 h-[calc(100%-0.5rem)] w-px bg-[#ececf1]"
                      />
                    ) : null}
                    <span className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#0071e3] bg-white" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#f5f5f7] px-3 py-1 text-[0.75rem] font-medium text-[#636366]">
                          {CATEGORY_LABELS[event.category]}
                        </span>
                        <time className="text-[0.8125rem] text-[#86868b]">
                          {formatShortDate(event.eventDate)}
                        </time>
                      </div>
                      <p className="mt-2 text-[1rem] font-semibold text-[#1d1d1f]">
                        {event.label}
                      </p>
                      <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
                        {event.subtitle}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rounded-2xl bg-[#f5f5f7] px-5 py-6 text-center">
                <p className="text-[1rem] font-semibold text-[#1d1d1f]">還沒有 Event</p>
                <p className="mt-2 text-[0.875rem] text-[#86868b]">
                  新增第一筆 Event，Timeline 會出現在這裡。
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
