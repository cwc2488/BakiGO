"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import {
  findPhotoComparePairs,
  renderPhotoCompareImage,
} from "@/lib/customers/customer-photo-compare";
import {
  getSaveToPhotoLibraryLabel,
  getSaveToPhotoLibrarySuccessMessage,
  saveDataUrlToPhotoLibrary,
} from "@/lib/images/image-file-utils";
import {
  CUSTOMER_PHOTO_ANGLE_LABELS,
  CUSTOMER_PHOTO_PHASE_LABELS,
  type CustomerProgressPhoto,
} from "@/types/customer";
import { useMemo, useState } from "react";

export function CustomerPhotoCompareSection({
  customerName,
  photos,
  readOnly = false,
}: {
  customerName: string;
  photos: CustomerProgressPhoto[];
  readOnly?: boolean;
}) {
  const pairs = useMemo(() => findPhotoComparePairs(photos), [photos]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activePair = pairs[activeIndex];

  if (pairs.length === 0) {
    return (
      <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
          對照圖
        </p>
        <p className="mt-3 text-[0.9375rem] text-[#86868b]">
          上傳同角度的使用前、使用後照片後，就能一鍵產生對照圖。
        </p>
      </section>
    );
  }

  const handleGenerate = async () => {
    if (!activePair?.before.imageDataUrl || !activePair.after.imageDataUrl) {
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsGenerating(true);
    try {
      const dataUrl = await renderPhotoCompareImage({
        beforeSrc: activePair.before.imageDataUrl,
        afterSrc: activePair.after.imageDataUrl,
        beforeLabel: `${CUSTOMER_PHOTO_PHASE_LABELS.before} · ${formatShortDate(activePair.before.photoDate)}`,
        afterLabel: `${CUSTOMER_PHOTO_PHASE_LABELS.after} · ${formatShortDate(activePair.after.photoDate)}`,
        customerName,
      });
      const method = await saveDataUrlToPhotoLibrary(dataUrl, `${customerName}-before-after.jpg`);
      setStatusMessage(getSaveToPhotoLibrarySuccessMessage(method));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }
      setError(caught instanceof Error ? caught.message : "無法產生對照圖");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
          對照圖
        </p>
        {pairs.length > 1 ? (
          <div className="flex gap-2">
            {pairs.map((pair, index) => (
              <button
                className={`rounded-full px-3 py-1 text-[0.75rem] font-medium ${
                  index === activeIndex
                    ? "bg-[#1d1d1f] text-white"
                    : "bg-[var(--brand-bg)] text-[#636366]"
                }`}
                key={pair.angle}
                onClick={() => setActiveIndex(index)}
                type="button"
              >
                {CUSTOMER_PHOTO_ANGLE_LABELS[pair.angle]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {activePair ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[activePair.before, activePair.after].map((photo) => (
            <figure key={photo.id}>
              <p className="mb-2 text-[0.8125rem] font-medium text-[#636366]">
                {CUSTOMER_PHOTO_PHASE_LABELS[photo.phase]}
              </p>
              {photo.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={CUSTOMER_PHOTO_PHASE_LABELS[photo.phase]}
                  className="aspect-[3/4] w-full rounded-2xl object-cover"
                  src={photo.imageDataUrl}
                />
              ) : null}
            </figure>
          ))}
        </div>
      ) : null}

      {!readOnly ? (
        <>
          <button
            className="mt-5 w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[1rem] font-semibold text-white disabled:opacity-60"
            disabled={isGenerating}
            onClick={() => void handleGenerate()}
            type="button"
          >
            {isGenerating ? "產生中…" : getSaveToPhotoLibraryLabel()}
          </button>
          {statusMessage ? (
            <p className="mt-2 text-[0.8125rem] text-[var(--brand-primary-dark)]">{statusMessage}</p>
          ) : null}
          {error ? <p className="mt-2 text-[0.8125rem] text-[#cf1322]">{error}</p> : null}
        </>
      ) : (
        <p className="mt-4 text-[0.8125rem] leading-relaxed text-[#86868b]">
          這是你的使用前後對照，繼續保持，有任何問題都可以跟教練說。
        </p>
      )}
    </section>
  );
}
