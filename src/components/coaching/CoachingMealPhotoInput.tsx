"use client";

import { useRef } from "react";

export function CoachingMealPhotoInput({
  uploading,
  onSelect,
  compact = false,
}: {
  uploading: boolean;
  onSelect: (file: File | null) => void;
  compact?: boolean;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null) => {
    onSelect(file);
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
    if (galleryInputRef.current) {
      galleryInputRef.current.value = "";
    }
  };

  const buttonClass = compact
    ? "rounded-[0.875rem] bg-[#f7f7f8] px-3 py-2.5 text-[0.875rem] font-medium text-[#636366] active:opacity-80"
    : "rounded-[0.875rem] bg-[var(--brand-bg)] px-4 py-3 text-[0.9375rem] font-medium text-[var(--brand-primary-dark)] active:opacity-80";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={uploading}
          onClick={() => cameraInputRef.current?.click()}
          type="button"
        >
          {uploading ? "上傳中…" : "拍照"}
        </button>
        <button
          className={buttonClass}
          disabled={uploading}
          onClick={() => galleryInputRef.current?.click()}
          type="button"
        >
          {uploading ? "上傳中…" : "從相簿選擇"}
        </button>
      </div>
      <input
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        type="file"
      />
      <input
        ref={galleryInputRef}
        accept="image/*"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        type="file"
      />
    </div>
  );
}
