"use client";

import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import {
  APP_IDS,
  todayISODate,
} from "@/lib/config/app-config";
import { processEventForCurrentMember } from "@/lib/event-center/process-event";
import { formatJoinedDate } from "@/lib/mission-control/format";
import {
  filterCustomerSuggestions,
  loadCustomerSuggestions,
} from "@/lib/retail/customer-suggestions";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WizardStep = 1 | 2 | 3 | 4;

const TRANSACTION_OPTIONS = [
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    label: "新顧客",
    hint: "金額",
    icon: "👤",
  },
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
    label: "舊顧客",
    hint: "金額",
    icon: "🔁",
  },
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    label: "新會員",
    hint: "VP",
    icon: "⭐",
  },
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
    label: "舊會員",
    hint: "VP",
    icon: "💎",
  },
] as const;

function getTransactionCurrencyCode(typeKey: string): string {
  const config = DEFAULT_BUSINESS_RULES.retailTransactionTypes.find(
    (type) => type.key === typeKey,
  );
  return config?.currencyCode ?? "TWD";
}

function isVpType(typeKey: string): boolean {
  return (
    typeKey === RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP ||
    typeKey === RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP
  );
}

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4].map((item) => (
        <span
          key={item}
          className={`h-2 rounded-full transition-all duration-250 ${
            item === step
              ? "w-8 bg-[#0071e3]"
              : item < step
                ? "w-2 bg-[#0071e3]/40"
                : "w-2 bg-[#ececf1]"
          }`}
        />
      ))}
    </div>
  );
}

export default function AddRetailTransactionPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [transactionTypeKey, setTransactionTypeKey] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [value, setValue] = useState("");
  const [eventDate, setEventDate] = useState(todayISODate());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMetrics, setSavedMetrics] = useState<MemberComputedMetrics | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const storage = createLocalStorageAdapter();
    setSuggestions(loadCustomerSuggestions(storage));
  }, []);

  const selectedOption = useMemo(
    () => TRANSACTION_OPTIONS.find((option) => option.key === transactionTypeKey),
    [transactionTypeKey],
  );

  const filteredSuggestions = useMemo(
    () => filterCustomerSuggestions(suggestions, customerName),
    [customerName, suggestions],
  );

  const valueUnit = isVpType(transactionTypeKey) ? "VP" : "NT$";

  function handleSelectType(typeKey: string) {
    setTransactionTypeKey(typeKey);
    setError(null);
    setStep(2);
  }

  function handleContinueToConfirm() {
    setError(null);

    if (!customerName.trim()) {
      setError("請輸入姓名");
      return;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setError(isVpType(transactionTypeKey) ? "請輸入有效的 VP" : "請輸入有效的金額");
      return;
    }

    setStep(3);
  }

  function handleSubmit() {
    if (!selectedOption) {
      setError("請選擇成交類型");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const storage = createLocalStorageAdapter();
      const parsedValue = Number(value);
      const metrics = processEventForCurrentMember(
        {
          eventTypeKey: transactionTypeKey,
          eventCategory: "transaction",
          eventDate,
          value: parsedValue,
          retailHouseKey: APP_IDS.defaultRetailHouseKey,
          metadata: {
            customerName: customerName.trim(),
            currencyCode: getTransactionCurrencyCode(transactionTypeKey),
            note: note.trim() || undefined,
          },
        },
        storage,
      );

      setSavedMetrics(metrics);
      setSuggestions(loadCustomerSuggestions(storage));
      setStep(4);
    } catch {
      setError("儲存失敗，請稍後再試");
    } finally {
      setIsSaving(false);
    }
  }

  function resetFlow() {
    setStep(1);
    setTransactionTypeKey("");
    setCustomerName("");
    setValue("");
    setNote("");
    setEventDate(todayISODate());
    setError(null);
    setSavedMetrics(null);
  }

  return (
    <div className="min-h-full bg-white">
      <main className="retail-flow-container mx-auto flex min-h-full flex-col px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-6">
        <header className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            {step > 1 && step < 4 ? (
              <button
                className="text-[0.9375rem] font-medium text-[#0071e3]"
                onClick={() => setStep((current) => (current === 3 ? 2 : 1) as WizardStep)}
                type="button"
              >
                返回
              </button>
            ) : (
              <Link className="text-[0.9375rem] font-medium text-[#0071e3]" href="/">
                取消
              </Link>
            )}
            <StepIndicator step={step} />
            <span className="w-10 text-right text-[0.8125rem] text-[#86868b]">{step}/4</span>
          </div>
        </header>

        {step === 1 ? (
          <section className="flex flex-1 flex-col">
            <div className="space-y-2">
              <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#1d1d1f]">
                選擇成交類型
              </h1>
              <p className="text-[1rem] text-[#86868b]">點選一項繼續</p>
            </div>

            <div className="mt-8 grid gap-3">
              {TRANSACTION_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  className="flex min-h-[4.5rem] items-center gap-4 rounded-[1.25rem] border border-[#ececf1] bg-white px-5 py-4 text-left shadow-[0_4px_24px_rgba(0,0,0,0.03)] transition-transform duration-200 active:scale-[0.98]"
                  onClick={() => handleSelectType(option.key)}
                  type="button"
                >
                  <span aria-hidden className="text-[1.75rem]">
                    {option.icon}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[1.125rem] font-semibold text-[#1d1d1f]">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[0.875rem] text-[#86868b]">
                      {option.hint}
                    </span>
                  </span>
                  <span aria-hidden className="text-[1.125rem] text-[#c7c7cc]">
                    →
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 2 && selectedOption ? (
          <section className="flex flex-1 flex-col">
            <div className="space-y-2">
              <p className="text-[0.875rem] font-medium text-[#86868b]">
                {selectedOption.icon} {selectedOption.label}
              </p>
              <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#1d1d1f]">
                輸入成交資料
              </h1>
            </div>

            <div className="mt-8 space-y-5">
              <div className="relative">
                <label className="block space-y-2">
                  <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">姓名</span>
                  <input
                    autoComplete="name"
                    className="w-full rounded-2xl border border-[#ececf1] bg-[#f5f5f7] px-4 py-4 text-[1.0625rem] text-[#1d1d1f] outline-none focus:border-[#0071e3] focus:bg-white"
                    onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
                    onChange={(event) => setCustomerName(event.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="輸入或搜尋姓名"
                    type="text"
                    value={customerName}
                  />
                </label>
                {showSuggestions && filteredSuggestions.length > 0 ? (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-[#ececf1] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
                    {filteredSuggestions.map((name) => (
                      <li key={name}>
                        <button
                          className="w-full px-4 py-3.5 text-left text-[1rem] text-[#1d1d1f] active:bg-[#f5f5f7]"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setCustomerName(name);
                            setShowSuggestions(false);
                          }}
                          type="button"
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <label className="block space-y-2">
                <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">
                  {isVpType(transactionTypeKey) ? "VP" : "金額（NT$）"}
                </span>
                <input
                  autoFocus
                  className="w-full rounded-2xl border border-[#ececf1] bg-[#f5f5f7] px-4 py-4 text-[1.375rem] font-semibold text-[#1d1d1f] outline-none focus:border-[#0071e3] focus:bg-white"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={isVpType(transactionTypeKey) ? "0" : "0"}
                  step="any"
                  type="number"
                  value={value}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">日期</span>
                <input
                  className="w-full rounded-2xl border border-[#ececf1] bg-[#f5f5f7] px-4 py-4 text-[1.0625rem] text-[#1d1d1f] outline-none focus:border-[#0071e3] focus:bg-white"
                  onChange={(event) => setEventDate(event.target.value)}
                  type="date"
                  value={eventDate}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">備註（選填）</span>
                <input
                  className="w-full rounded-2xl border border-[#ececf1] bg-[#f5f5f7] px-4 py-4 text-[1.0625rem] text-[#1d1d1f] outline-none focus:border-[#0071e3] focus:bg-white"
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="補充說明"
                  type="text"
                  value={note}
                />
              </label>
            </div>

            {error ? (
              <p className="mt-5 rounded-2xl bg-[#fff1f0] px-4 py-3 text-[0.9375rem] text-[#cf1322]">
                {error}
              </p>
            ) : null}

            <div className="mt-auto pt-8 pb-[env(safe-area-inset-bottom)]">
              <button
                className="w-full rounded-[1.25rem] bg-[#0071e3] px-4 py-4 text-[1.125rem] font-semibold text-white transition-transform duration-200 active:scale-[0.98]"
                onClick={handleContinueToConfirm}
                type="button"
              >
                繼續
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 && selectedOption ? (
          <section className="flex flex-1 flex-col">
            <div className="space-y-2">
              <p className="text-[0.875rem] font-medium text-[#86868b]">確認成交</p>
              <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#1d1d1f]">
                成交摘要
              </h1>
            </div>

            <div className="mt-8 rounded-[1.75rem] bg-[#f5f5f7] p-6">
              <dl className="space-y-5">
                <div>
                  <dt className="text-[0.8125rem] font-medium text-[#86868b]">類型</dt>
                  <dd className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">
                    {selectedOption.icon} {selectedOption.label}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.8125rem] font-medium text-[#86868b]">姓名</dt>
                  <dd className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">
                    {customerName.trim()}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.8125rem] font-medium text-[#86868b]">
                    {isVpType(transactionTypeKey) ? "VP" : "金額"}
                  </dt>
                  <dd className="mt-1 text-[2rem] font-semibold leading-none tracking-tight text-[#1d1d1f]">
                    {value} <span className="text-[1rem] font-medium text-[#86868b]">{valueUnit}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.8125rem] font-medium text-[#86868b]">日期</dt>
                  <dd className="mt-1 text-[1.0625rem] font-medium text-[#1d1d1f]">
                    {formatJoinedDate(eventDate)}
                  </dd>
                </div>
                {note.trim() ? (
                  <div>
                    <dt className="text-[0.8125rem] font-medium text-[#86868b]">備註</dt>
                    <dd className="mt-1 text-[1.0625rem] text-[#636366]">{note.trim()}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {error ? (
              <p className="mt-5 rounded-2xl bg-[#fff1f0] px-4 py-3 text-[0.9375rem] text-[#cf1322]">
                {error}
              </p>
            ) : null}

            <div className="mt-auto space-y-3 pt-8 pb-[env(safe-area-inset-bottom)]">
              <button
                className="w-full rounded-[1.25rem] bg-[#1d1d1f] px-4 py-4 text-[1.125rem] font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
                disabled={isSaving}
                onClick={handleSubmit}
                type="button"
              >
                {isSaving ? "處理中…" : "完成成交"}
              </button>
              <button
                className="w-full rounded-[1.25rem] bg-[#f5f5f7] px-4 py-3.5 text-[1rem] font-medium text-[#636366]"
                disabled={isSaving}
                onClick={() => setStep(2)}
                type="button"
              >
                返回修改
              </button>
            </div>
          </section>
        ) : null}

        {step === 4 && savedMetrics && selectedOption ? (
          <section className="flex flex-1 flex-col">
            <div className="flex flex-col items-center pt-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#30d158]/15 text-[2rem]">
                ✓
              </span>
              <h1 className="mt-6 text-[1.75rem] font-semibold tracking-tight text-[#1d1d1f]">
                成交完成
              </h1>
              <p className="mt-2 text-[1rem] text-[#86868b]">
                {selectedOption.label} · {customerName.trim()} · {value} {valueUnit}
              </p>
            </div>

            <div className="mt-8 rounded-[1.75rem] border border-[#ececf1] p-5">
              <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
                系統已更新
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#f5f5f7] px-4 py-3">
                  <dt className="text-[0.75rem] text-[#86868b]">本月 VP</dt>
                  <dd className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">
                    {savedMetrics.vp.totalVp}
                  </dd>
                </div>
                <div className="rounded-2xl bg-[#f5f5f7] px-4 py-3">
                  <dt className="text-[0.75rem] text-[#86868b]">Challenge</dt>
                  <dd className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">
                    {savedMetrics.monthlyChallenge.overallProgressPercent}%
                  </dd>
                </div>
                <div className="rounded-2xl bg-[#f5f5f7] px-4 py-3">
                  <dt className="text-[0.75rem] text-[#86868b]">Mission</dt>
                  <dd className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">
                    {savedMetrics.missions.dailyMissionSet.missions.length} 項
                  </dd>
                </div>
                <div className="rounded-2xl bg-[#f5f5f7] px-4 py-3">
                  <dt className="text-[0.75rem] text-[#86868b]">President AI</dt>
                  <dd className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">
                    {savedMetrics.presidentAI.topPriorities.length} 優先
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-auto space-y-3 pt-8 pb-[env(safe-area-inset-bottom)]">
              <Link
                className="flex w-full items-center justify-center rounded-[1.25rem] bg-[#0071e3] px-4 py-4 text-[1.125rem] font-semibold text-white transition-transform duration-200 active:scale-[0.98]"
                href="/"
              >
                返回首頁
              </Link>
              <button
                className="w-full rounded-[1.25rem] bg-[#f5f5f7] px-4 py-3.5 text-[1rem] font-medium text-[#636366]"
                onClick={resetFlow}
                type="button"
              >
                再記一筆
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
