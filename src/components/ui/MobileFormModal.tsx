"use client";

import { useBodyScrollLock } from "@/lib/ui/use-body-scroll-lock";
import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function MobileFormModal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const modalRootRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open, modalRootRef);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-[120] flex items-end justify-center overflow-hidden overscroll-none touch-none sm:items-center sm:p-4"
    >
      <button
        aria-label="關閉"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        type="button"
      />
      <div className="relative mb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] flex w-full max-w-md max-h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom,0px))] touch-auto flex-col overflow-hidden rounded-t-[1.75rem] bg-[var(--brand-surface)] shadow-xl sm:mb-0 sm:max-h-[90vh] sm:rounded-[1.75rem]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--brand-border)] px-5 py-4">
          <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">{title}</h2>
          <button
            className="rounded-lg px-2 py-1 text-[0.9375rem] font-medium text-[var(--brand-primary-dark)]"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
        </div>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        <div className="shrink-0 border-t border-[var(--brand-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}
