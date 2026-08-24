"use client";

import { useMemo, useState } from "react";
import {
  MobileDismissibleSheet,
  MobileDismissibleSheetBody,
  MobileDismissibleSheetHandle,
} from "@/components/ui/MobileDismissibleSheet";
import { getMonthGridDates } from "@/lib/calendar/recurrence";
import { shiftMonth } from "@/lib/calendar/calendar-stats";
import { formatChineseYearMonth, getTodayDateString } from "@/lib/calendar/time-grid";
import { formatSelectedCopyDatesZh } from "@/lib/calendar/copy-event-to-dates";

export function CopyEventDatesSheet({
  open,
  title,
  sourceDate,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  sourceDate: string;
  onClose: () => void;
  onConfirm: (dates: string[]) => void | Promise<void>;
}) {
  const [anchorDate, setAnchorDate] = useState(sourceDate || getTodayDateString());
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const today = getTodayDateString();
  const gridDates = useMemo(() => getMonthGridDates(anchorDate), [anchorDate]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleDate = (date: string) => {
    setSelected((current) =>
      current.includes(date) ? current.filter((item) => item !== date) : [...current, date],
    );
  };

  const handleConfirm = async () => {
    if (busy || selected.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await onConfirm(selected);
      setSelected([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileDismissibleSheet
      onClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      open={open}
      panelClassName="mb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] flex w-full max-w-md max-h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden rounded-t-[1.75rem] bg-[var(--cal-surface)] shadow-xl sm:mb-0 sm:max-h-[90vh] sm:rounded-[1.75rem]"
      rootClassName="z-[130]"
    >
      <MobileDismissibleSheetHandle />
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cal-border)] px-6 py-4">
        <div>
          <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">複製事件</h2>
          <p className="mt-0.5 text-[0.875rem] text-[#86868b]">{title || "行程"}</p>
        </div>
        <button
          className="rounded-lg px-2 py-1 text-[0.9375rem] font-medium text-[var(--cal-primary-dark)]"
          disabled={busy}
          onClick={onClose}
          type="button"
        >
          取消
        </button>
      </div>

      <MobileDismissibleSheetBody className="px-6 py-4">
        <p className="text-[0.875rem] leading-relaxed text-[#636366]">
          {formatSelectedCopyDatesZh(selected)}
        </p>
        <p className="mt-1 text-[0.75rem] text-[#86868b]">
          可複選多個日期。不會自動包含原日期，除非你主動點選。
        </p>

        <div className="mt-4 rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] p-3">
          <div className="mb-3 flex items-center justify-between">
            <button
              className="rounded-lg px-2 py-1 text-[0.9375rem] text-[#636366]"
              onClick={() => setAnchorDate(shiftMonth(anchorDate, -1))}
              type="button"
            >
              ‹
            </button>
            <p className="text-[1rem] font-semibold text-[#1d1d1f]">
              {formatChineseYearMonth(anchorDate)}
            </p>
            <button
              className="rounded-lg px-2 py-1 text-[0.9375rem] text-[#636366]"
              onClick={() => setAnchorDate(shiftMonth(anchorDate, 1))}
              type="button"
            >
              ›
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 text-center text-[0.6875rem] font-medium text-[var(--cal-text-muted)]">
            {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {gridDates.map((date) => {
              const inMonth = date.slice(0, 7) === anchorDate.slice(0, 7);
              const isSelected = selectedSet.has(date);
              const isToday = date === today;
              const isSource = date === sourceDate;
              return (
                <button
                  key={date}
                  className={`relative flex h-10 items-center justify-center rounded-full text-[0.875rem] ${
                    isSelected
                      ? "bg-[var(--cal-primary)] font-semibold text-white"
                      : isToday
                        ? "bg-[#1d1d1f] font-semibold text-white"
                        : inMonth
                          ? "text-[#1d1d1f]"
                          : "text-[#c7c7cc]"
                  }`}
                  onClick={() => toggleDate(date)}
                  type="button"
                >
                  {Number(date.slice(8, 10))}
                  {isSource && !isSelected ? (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--cal-primary)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </MobileDismissibleSheetBody>

      <div className="shrink-0 border-t border-[var(--cal-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <button
          className="w-full rounded-xl bg-[var(--cal-primary)] px-4 py-3.5 text-[1rem] font-semibold text-white disabled:opacity-50"
          disabled={busy || selected.length === 0}
          onClick={() => void handleConfirm()}
          type="button"
        >
          {busy ? "複製中…" : "複製到已選擇的日期"}
        </button>
      </div>
    </MobileDismissibleSheet>
  );
}
