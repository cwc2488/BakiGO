"use client";

import { APP_EMOJI } from "@/lib/ui/app-emojis";
import { useBodyScrollLock } from "@/lib/ui/use-body-scroll-lock";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export function SuperLeagueAddModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { displayName: string; isSupervisor: boolean }) => void;
}) {
  const modalRootRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open, modalRootRef);
  const [displayName, setDisplayName] = useState("");
  const [isSupervisor, setIsSupervisor] = useState(false);

  if (!open) {
    return null;
  }

  function resetAndClose() {
    setDisplayName("");
    setIsSupervisor(false);
    onClose();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!displayName.trim()) {
      return;
    }
    onSubmit({ displayName: displayName.trim(), isSupervisor });
    resetAndClose();
  }

  return createPortal(
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-[120] flex items-end justify-center overflow-hidden overscroll-none touch-none sm:items-center sm:p-4"
    >
      <button
        aria-label="關閉"
        className="absolute inset-0 bg-black/40"
        onClick={resetAndClose}
        type="button"
      />
      <div className="relative mb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] flex w-full max-w-md max-h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom,0px))] touch-auto flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-xl sm:mb-0 sm:max-h-[90vh] sm:rounded-[1.5rem]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--brand-border)] px-5 py-4">
          <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.section.superLeague} 加入超級聯賽
          </h2>
          <button
            className="rounded-lg px-2 py-1 text-[0.9375rem] font-medium text-[var(--brand-primary-dark)]"
            onClick={resetAndClose}
            type="button"
          >
            取消
          </button>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 py-4">
            <p className="text-[0.8125rem] text-[#86868b]">僅手動新增的夥伴會計入超級聯賽</p>
            <div className="mt-4 space-y-4">
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#1d1d1f]">夥伴姓名</span>
                <input
                  autoFocus
                  className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3"
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  value={displayName}
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
            </div>
          </div>

          <div className="shrink-0 border-t border-[var(--brand-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <button
              className="w-full rounded-xl bg-[var(--brand-primary)] py-3.5 text-[1rem] font-semibold text-white disabled:opacity-50"
              disabled={!displayName.trim()}
              type="submit"
            >
              新增
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
