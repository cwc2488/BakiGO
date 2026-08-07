"use client";

import { useRef } from "react";

export function ImageUploadButtons({
  label = "照片",
  cameraLabel = "拍照",
  libraryLabel = "從相簿選擇",
  disabled = false,
  onFileSelect,
}: {
  label?: string;
  cameraLabel?: string;
  libraryLabel?: string;
  disabled?: boolean;
  onFileSelect: (file: File) => void | Promise<void>;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void onFileSelect(file);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">{label}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          className="rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[0.9375rem] font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
          disabled={disabled}
          onClick={() => cameraInputRef.current?.click()}
          type="button"
        >
          {cameraLabel}
        </button>
        <button
          className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 text-[0.9375rem] font-semibold text-[#1d1d1f] transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
          disabled={disabled}
          onClick={() => libraryInputRef.current?.click()}
          type="button"
        >
          {libraryLabel}
        </button>
      </div>
      <input
        ref={cameraInputRef}
        accept="image/*,.heic,.heif"
        capture="environment"
        className="hidden"
        disabled={disabled}
        onChange={handleChange}
        type="file"
      />
      <input
        ref={libraryInputRef}
        accept="image/*,.heic,.heif"
        className="hidden"
        disabled={disabled}
        onChange={handleChange}
        type="file"
      />
    </div>
  );
}

export function ImageUploadSectionButton({
  active,
  activeLabel = "取消",
  inactiveLabel,
  onClick,
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`shrink-0 rounded-full px-4 py-2.5 text-[0.8125rem] font-semibold transition-transform duration-200 active:scale-[0.98] ${
        active
          ? "border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[#636366]"
          : "bg-[#1d1d1f] text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}
