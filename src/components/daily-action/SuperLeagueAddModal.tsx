"use client";

import type { DailyActionSuperLeagueEntryView } from "@/types/daily-action";
import { IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { useBodyScrollLock } from "@/lib/ui/use-body-scroll-lock";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

function SuperLeagueEntryForm({
  initialDisplayName,
  initialIsSupervisor,
  isEditMode,
  onSubmit,
  onDelete,
}: {
  initialDisplayName: string;
  initialIsSupervisor: boolean;
  isEditMode: boolean;
  onSubmit: (input: { displayName: string; isSupervisor: boolean }) => void;
  onDelete?: () => void;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [isSupervisor, setIsSupervisor] = useState(initialIsSupervisor);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!displayName.trim()) {
      return;
    }
    onSubmit({ displayName: displayName.trim(), isSupervisor });
  }

  return (
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
          <div className="space-y-2">
            <span className="text-[0.875rem] font-medium text-[#1d1d1f]">身份</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-xl border px-4 py-3 text-[0.9375rem] font-medium ${
                  !isSupervisor
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary-light)] text-[var(--brand-primary-dark)]"
                    : "border-[var(--brand-border)] bg-white text-[#636366]"
                }`}
                onClick={() => setIsSupervisor(false)}
                type="button"
              >
                會員
              </button>
              <button
                className={`rounded-xl border px-4 py-3 text-[0.9375rem] font-medium ${
                  isSupervisor
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary-light)] text-[var(--brand-primary-dark)]"
                    : "border-[var(--brand-border)] bg-white text-[#636366]"
                }`}
                onClick={() => setIsSupervisor(true)}
                type="button"
              >
                督導
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-[var(--brand-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <button
          className="w-full rounded-xl bg-[var(--brand-primary)] py-3.5 text-[1rem] font-semibold text-white disabled:opacity-50"
          disabled={!displayName.trim()}
          type="submit"
        >
          {isEditMode ? "儲存" : "新增"}
        </button>
        {isEditMode && onDelete ? (
          <button
            className="w-full rounded-xl border border-[#ff375f] py-3 text-[0.9375rem] font-semibold text-[#ff375f]"
            onClick={onDelete}
            type="button"
          >
            移除夥伴
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function SuperLeagueAddModal({
  open,
  editingEntry = null,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  editingEntry?: DailyActionSuperLeagueEntryView | null;
  onClose: () => void;
  onSubmit: (input: { displayName: string; isSupervisor: boolean }) => void;
  onDelete?: () => void;
}) {
  const modalRootRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open, modalRootRef);
  const isEditMode = editingEntry !== null;

  if (!open) {
    return null;
  }

  function handleSubmit(input: { displayName: string; isSupervisor: boolean }) {
    onSubmit(input);
    onClose();
  }

  function handleDelete() {
    onDelete?.();
    onClose();
  }

  return createPortal(
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-[120] flex items-end justify-center overflow-hidden overscroll-none touch-none sm:items-center sm:p-4"
    >
      <button
        aria-label="關閉"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        type="button"
      />
      <div className="relative mb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] flex w-full max-w-md max-h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom,0px))] touch-auto flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-xl sm:mb-0 sm:max-h-[90vh] sm:rounded-[1.5rem]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--brand-border)] px-5 py-4">
          <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
            <IconLabel icon={APP_ICON.section.superLeague}>
              {isEditMode ? "編輯夥伴" : "加入超級聯賽"}
            </IconLabel>
          </h2>
          <button
            className="rounded-lg px-2 py-1 text-[0.9375rem] font-medium text-[var(--brand-primary-dark)]"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
        </div>

        <SuperLeagueEntryForm
          key={editingEntry?.id ?? "new"}
          initialDisplayName={editingEntry?.displayName ?? ""}
          initialIsSupervisor={editingEntry?.isSupervisor ?? false}
          isEditMode={isEditMode}
          onDelete={isEditMode ? handleDelete : undefined}
          onSubmit={handleSubmit}
        />
      </div>
    </div>,
    document.body,
  );
}
