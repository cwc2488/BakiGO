"use client";

import {
  AVATAR_OUTPUT_SIZES,
  centerPan,
  clampPan,
  cropImageToJpegBlob,
  loadImageElement,
  resolveMinCoverScale,
  type AvatarOutputSize,
} from "@/lib/members/crop-image-to-blob";
import { MobileFormModal } from "@/components/ui/MobileFormModal";
import { MemberAvatar } from "@/components/members/MemberAvatar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const VIEWPORT_SIZE = 280;

export function AvatarCropModal({
  open,
  imageSrc,
  displayName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  imageSrc: string | null;
  displayName: string;
  onClose: () => void;
  onConfirm: (blob: Blob) => Promise<void>;
}) {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [outputSize, setOutputSize] = useState<AvatarOutputSize>(512);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  const imageSize = useMemo(
    () => ({
      width: imageElement?.naturalWidth ?? 0,
      height: imageElement?.naturalHeight ?? 0,
    }),
    [imageElement],
  );

  const minScale = useMemo(
    () => resolveMinCoverScale(imageSize.width, imageSize.height, VIEWPORT_SIZE),
    [imageSize.height, imageSize.width],
  );

  const maxScale = minScale * 3;

  useEffect(() => {
    if (!open || !imageSrc) {
      return;
    }

    let cancelled = false;

    void loadImageElement(imageSrc)
      .then((image) => {
        if (cancelled) {
          return;
        }
        const nextMinScale = resolveMinCoverScale(image.naturalWidth, image.naturalHeight, VIEWPORT_SIZE);
        const nextPan = centerPan({
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          scale: nextMinScale,
          viewportSize: VIEWPORT_SIZE,
        });
        setImageElement(image);
        setScale(nextMinScale);
        setPan({ x: nextPan.panX, y: nextPan.panY });
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage("無法載入圖片");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageSrc, open]);

  useEffect(() => {
    if (!imageElement) {
      return;
    }

    let cancelled = false;
    void cropImageToJpegBlob({
      image: imageElement,
      viewportSize: VIEWPORT_SIZE,
      scale,
      panX: pan.x,
      panY: pan.y,
      outputSize,
      quality: 0.9,
    })
      .then((blob) => {
        if (cancelled) {
          return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return url;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageElement, outputSize, pan.x, pan.y, scale]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const updatePan = useCallback(
    (nextPan: { x: number; y: number }) => {
      if (!imageElement) {
        return;
      }
      const clamped = clampPan({
        panX: nextPan.x,
        panY: nextPan.y,
        imageWidth: imageElement.naturalWidth,
        imageHeight: imageElement.naturalHeight,
        scale,
        viewportSize: VIEWPORT_SIZE,
      });
      setPan({ x: clamped.panX, y: clamped.panY });
    },
    [imageElement, scale],
  );

  function handleScaleChange(nextScale: number) {
    if (!imageElement) {
      return;
    }

    const clampedScale = Math.min(maxScale, Math.max(minScale, nextScale));
    const centerX = VIEWPORT_SIZE / 2;
    const centerY = VIEWPORT_SIZE / 2;
    const imageCenterX = (centerX - pan.x) / scale;
    const imageCenterY = (centerY - pan.y) / scale;
    const nextPan = centerPan({
      imageWidth: imageElement.naturalWidth,
      imageHeight: imageElement.naturalHeight,
      scale: clampedScale,
      viewportSize: VIEWPORT_SIZE,
    });

    const adjusted = clampPan({
      panX: centerX - imageCenterX * clampedScale,
      panY: centerY - imageCenterY * clampedScale,
      imageWidth: imageElement.naturalWidth,
      imageHeight: imageElement.naturalHeight,
      scale: clampedScale,
      viewportSize: VIEWPORT_SIZE,
    });

    setScale(clampedScale);
    setPan({
      x: Number.isFinite(adjusted.panX) ? adjusted.panX : nextPan.panX,
      y: Number.isFinite(adjusted.panY) ? adjusted.panY : nextPan.panY,
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!imageElement) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    updatePan({
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY),
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragStateRef.current = null;
    }
  }

  async function handleConfirm() {
    if (!imageElement) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const blob = await cropImageToJpegBlob({
        image: imageElement,
        viewportSize: VIEWPORT_SIZE,
        scale,
        panX: pan.x,
        panY: pan.y,
        outputSize,
        quality: 0.9,
      });
      await onConfirm(blob);
      onClose();
    } catch (caught) {
      setErrorMessage(caught instanceof Error ? caught.message : "儲存失敗");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <MobileFormModal
      footer={
        <button
          className="w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3.5 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
          disabled={!imageElement || isSaving}
          onClick={() => void handleConfirm()}
          type="button"
        >
          {isSaving ? "上傳中…" : "確認並上傳"}
        </button>
      }
      onClose={onClose}
      open={open}
      title="裁切頭像"
    >
      <div className="space-y-5">
        <div
          className="relative mx-auto overflow-hidden rounded-[1.25rem] bg-[#1d1d1f] touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
        >
          {imageSrc && imageElement ? (
            <img
              alt="裁切預覽"
              className="absolute left-0 top-0 max-w-none select-none"
              draggable={false}
              src={imageSrc}
              style={{
                left: pan.x,
                top: pan.y,
                width: imageElement.naturalWidth * scale,
                height: imageElement.naturalHeight * scale,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[0.875rem] text-white/70">
              載入中…
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 rounded-[1.25rem] ring-2 ring-white/90 ring-inset" />
          <div className="pointer-events-none absolute inset-0 rounded-[1.25rem] shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.18)]" />
        </div>

        <p className="text-center text-[0.8125rem] text-[#86868b]">拖曳調整位置，滑桿縮放大小</p>

        <label className="block space-y-2">
          <span className="text-[0.8125rem] font-medium text-[#86868b]">縮放</span>
          <input
            className="w-full accent-[var(--brand-primary)]"
            max={maxScale}
            min={minScale}
            onChange={(event) => handleScaleChange(Number(event.target.value))}
            step={0.01}
            type="range"
            value={scale}
          />
        </label>

        <div className="space-y-2">
          <span className="text-[0.8125rem] font-medium text-[#86868b]">輸出尺寸</span>
          <div className="grid grid-cols-3 gap-2">
            {AVATAR_OUTPUT_SIZES.map((option) => (
              <button
                key={option.value}
                className={`rounded-xl px-3 py-2.5 text-[0.875rem] font-semibold ${
                  outputSize === option.value
                    ? "bg-[var(--brand-primary-light)] text-[var(--brand-primary-dark)]"
                    : "bg-[var(--brand-bg)] text-[#636366]"
                }`}
                onClick={() => setOutputSize(option.value)}
                type="button"
              >
                {option.label}
                <span className="mt-0.5 block text-[0.6875rem] font-medium opacity-80">
                  {option.value}px
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
          <MemberAvatar avatarUrl={previewUrl} name={displayName} size="md" />
          <div>
            <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">圓形預覽</p>
            <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">組織圖會以圓形顯示</p>
          </div>
        </div>

        {errorMessage ? <p className="text-[0.8125rem] text-[#ff375f]">{errorMessage}</p> : null}
      </div>
    </MobileFormModal>
  );
}
