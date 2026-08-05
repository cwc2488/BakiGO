"use client";

import { APP_EMOJI } from "@/lib/ui/app-emojis";
import { useState } from "react";

export function SuperLeagueAddModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { displayName: string; isSupervisor: boolean }) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [isSupervisor, setIsSupervisor] = useState(false);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[1.5rem] bg-white p-5">
        <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
          {APP_EMOJI.section.superLeague} 加入超級聯賽
        </h2>
        <p className="mt-1 text-[0.8125rem] text-[#86868b]">僅手動新增的夥伴會計入超級聯賽</p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!displayName.trim()) {
              return;
            }
            onSubmit({ displayName: displayName.trim(), isSupervisor });
            setDisplayName("");
            setIsSupervisor(false);
            onClose();
          }}
        >
          <label className="block space-y-2">
            <span className="text-[0.875rem] font-medium text-[#1d1d1f]">夥伴姓名</span>
            <input
              className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-[0.875rem] text-[#1d1d1f]">
            <input
              checked={isSupervisor}
              className="h-4 w-4 accent-[var(--brand-primary)]"
              onChange={(event) => setIsSupervisor(event.target.checked)}
              type="checkbox"
            />
            已是督導
          </label>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-xl border border-[var(--brand-border)] py-3 font-medium"
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="flex-1 rounded-xl bg-[var(--brand-primary)] py-3 font-semibold text-white"
              type="submit"
            >
              新增
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
