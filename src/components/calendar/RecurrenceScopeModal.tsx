"use client";

import {
  MobileDismissibleSheet,
  MobileDismissibleSheetHandle,
} from "@/components/ui/MobileDismissibleSheet";
import type { RecurrenceEditScope } from "@/types/calendar-event";

export function RecurrenceScopeModal({
  open,
  mode,
  onClose,
  onConfirm,
}: {
  open: boolean;
  mode: "edit" | "delete";
  onClose: () => void;
  onConfirm: (scope: RecurrenceEditScope) => void;
}) {
  const title = mode === "delete" ? "刪除重複行程" : "修改重複行程";

  return (
    <MobileDismissibleSheet
      onClose={onClose}
      open={open}
      panelClassName="w-full max-w-md rounded-t-[1.75rem] bg-[var(--cal-surface)] p-6 shadow-xl sm:rounded-[1.75rem]"
      rootClassName="z-[130]"
    >
      <MobileDismissibleSheetHandle />
      <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">{title}</h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[#86868b]">
        這是一個重複行程。你要{mode === "delete" ? "刪除" : "修改"}哪一部分？
      </p>

      <div className="mt-5 space-y-2">
        <button
          className="w-full rounded-xl border border-[var(--cal-border)] px-4 py-3.5 text-left"
          onClick={() => onConfirm("this")}
          type="button"
        >
          <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">僅此事件</p>
          <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">只影響你選取的這一天</p>
        </button>
        <button
          className="w-full rounded-xl border border-[var(--cal-border)] px-4 py-3.5 text-left"
          onClick={() => onConfirm("this_and_future")}
          type="button"
        >
          <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">此事件及後續</p>
          <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">包含這天與之後所有重複（每週等）</p>
        </button>
      </div>

      <button
        className="mt-4 w-full rounded-xl px-4 py-3 text-[0.9375rem] font-medium text-[#86868b]"
        onClick={onClose}
        type="button"
      >
        取消
      </button>
    </MobileDismissibleSheet>
  );
}
