"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { CONSULTATION_TOTAL_STEPS } from "@/types/consultation";

export function ConsultationFlowShell({
  step,
  title,
  purpose,
  children,
  footer,
}: {
  step: number;
  title: string;
  purpose: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const percent = Math.round((step / CONSULTATION_TOTAL_STEPS) * 100);

  return (
    <div className="min-h-full bg-[#faf6f1]">
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-6 sm:px-6">
        <ConsultationProgressBar current={step} total={CONSULTATION_TOTAL_STEPS} percent={percent} />
        <div className="mt-6 space-y-2">
          <p className="text-sm font-medium text-[#c08a98]">Step {step} / {CONSULTATION_TOTAL_STEPS}</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight text-[#2f2622]">{title}</h1>
          <p className="text-[0.98rem] leading-7 text-[#6f5f57]">{purpose}</p>
        </div>
        <div className="mt-6 flex-1">{children}</div>
        {footer ? <footer className="mt-8">{footer}</footer> : null}
      </main>
    </div>
  );
}

function ConsultationProgressBar({
  current,
  total,
  percent,
}: {
  current: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-[#8b7d74]">
        <span>
          第 {current} / {total} 步
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#eadfd6]">
        <div
          className="h-full rounded-full bg-[#f0a8b8] transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function ConsultationFormActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-10 -mx-1 mt-6 bg-[#faf6f1]/95 px-1 pb-2 pt-4 backdrop-blur-sm">
      {children}
    </div>
  );
}

export function ConsultationPrimaryButton({
  children,
  disabled,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-[1.25rem] bg-[#2f2622] px-5 py-4 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function ConsultationField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#5f4f47]">{label}</span>
      {hint ? <span className="mb-2 block text-xs leading-5 text-[#9a8b82]">{hint}</span> : null}
      {children}
    </label>
  );
}

export function ConsultationInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base outline-none focus:border-[#f0a8b8]"
    />
  );
}

export function ConsultationTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="min-h-[6.5rem] w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base outline-none focus:border-[#f0a8b8]"
    />
  );
}
