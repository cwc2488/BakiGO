"use client";

import {
  clampRecognitionNormalizedCrop,
  constrainRecognitionCropToPortraitAspect,
  defaultRecognitionCoverCrop,
  RECOGNITION_PRESENTATION_CROP_ASPECT_RATIO,
} from "@/lib/recognition/recognition-photo-review";
import type { RecognitionNormalizedCrop } from "@/types/recognition";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type DragMode = "move" | "se" | "nw" | null;

export function PresentationCropEditor({
  imageUrl,
  crop,
  onChange,
  onDimensions,
}: {
  imageUrl: string;
  crop: RecognitionNormalizedCrop | null;
  onChange: (crop: RecognitionNormalizedCrop) => void;
  onDimensions: (width: number, height: number) => void;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const drag = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origin: RecognitionNormalizedCrop;
  } | null>(null);

  const applyDefault = useCallback((width: number, height: number) => {
    onDimensions(width, height);
    if (!crop) {
      onChange(defaultRecognitionCoverCrop({ originalWidth: width, originalHeight: height }));
    }
  }, [crop, onChange, onDimensions]);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.naturalWidth) {
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
      applyDefault(image.naturalWidth, image.naturalHeight);
    }
  }, [imageUrl, applyDefault]);

  function currentCrop(): RecognitionNormalizedCrop {
    if (crop) return crop;
    if (!natural) return { x: 0.125, y: 0, width: 0.75, height: 1 };
    return defaultRecognitionCoverCrop({
      originalWidth: natural.width,
      originalHeight: natural.height,
    });
  }

  function pointerToNormalized(event: ReactPointerEvent<Element>) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(mode: DragMode, event: ReactPointerEvent<Element>) {
    event.preventDefault();
    event.stopPropagation();
    frameRef.current?.setPointerCapture(event.pointerId);
    drag.current = {
      mode,
      startX: pointerToNormalized(event).x,
      startY: pointerToNormalized(event).y,
      origin: currentCrop(),
    };
  }

  function onPointerMove(event: ReactPointerEvent<Element>) {
    if (!drag.current || !natural) return;
    const point = pointerToNormalized(event);
    const dx = point.x - drag.current.startX;
    const dy = point.y - drag.current.startY;
    const origin = drag.current.origin;
    if (drag.current.mode === "move") {
      onChange(clampRecognitionNormalizedCrop({
        ...origin,
        x: origin.x + dx,
        y: origin.y + dy,
      }));
      return;
    }
    let next = { ...origin };
    if (drag.current.mode === "se") {
      next = { ...origin, width: origin.width + dx, height: origin.height + dy };
    }
    if (drag.current.mode === "nw") {
      next = {
        x: origin.x + dx,
        y: origin.y + dy,
        width: origin.width - dx,
        height: origin.height - dy,
      };
    }
    onChange(constrainRecognitionCropToPortraitAspect({
      crop: next,
      originalWidth: natural.width,
      originalHeight: natural.height,
      aspectRatio: RECOGNITION_PRESENTATION_CROP_ASPECT_RATIO,
    }));
  }

  function onPointerUp() {
    drag.current = null;
  }

  const box = currentCrop();
  const previewStyle: CSSProperties | undefined = natural
    ? {
        objectPosition: `${((box.x + box.width / 2) * 100)}% ${((box.y + box.height / 2) * 100)}%`,
        objectFit: "cover",
      }
    : undefined;

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-[0.75rem] font-medium text-[#86868b]">原始照片 · 拖曳裁切框</p>
        <div
          ref={frameRef}
          className="relative inline-block max-w-full touch-none overflow-hidden rounded-2xl bg-[#111]"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Authorized blob URL; next/image cannot take object URLs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={imageUrl}
            alt=""
            className="block max-h-[70vh] w-auto max-w-full select-none"
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              setNatural({ width: image.naturalWidth, height: image.naturalHeight });
              applyDefault(image.naturalWidth, image.naturalHeight);
            }}
          />
          <div
            className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
            onPointerDown={(event) => onPointerDown("move", event)}
          >
            <button
              type="button"
              aria-label="左上調整"
              className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-white"
              onPointerDown={(event) => onPointerDown("nw", event)}
            />
            <button
              type="button"
              aria-label="右下調整"
              className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full bg-white"
              onPointerDown={(event) => onPointerDown("se", event)}
            />
          </div>
        </div>
        {natural && (
          <label className="mt-3 flex items-center gap-3 text-[0.8125rem] text-[#6f7d73]">
            縮放
            <input
              type="range"
              min={0.7}
              max={1.4}
              step={0.01}
              defaultValue={1}
              className="flex-1"
              onChange={(event) => {
                const factor = Number(event.currentTarget.value);
                const origin = currentCrop();
                const cx = origin.x + origin.width / 2;
                const cy = origin.y + origin.height / 2;
                const nextWidth = Math.min(1, origin.width / factor);
                const nextHeight = Math.min(1, origin.height / factor);
                onChange(constrainRecognitionCropToPortraitAspect({
                  crop: {
                    x: cx - nextWidth / 2,
                    y: cy - nextHeight / 2,
                    width: nextWidth,
                    height: nextHeight,
                  },
                  originalWidth: natural.width,
                  originalHeight: natural.height,
                  aspectRatio: RECOGNITION_PRESENTATION_CROP_ASPECT_RATIO,
                }));
              }}
            />
          </label>
        )}
      </div>
      <div className="w-full shrink-0 lg:w-40">
        <p className="mb-2 text-[0.75rem] font-medium text-[#86868b]">3:4 預覽</p>
        <div className="overflow-hidden rounded-2xl bg-[#111]" style={{ aspectRatio: "3 / 4" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-full w-full" style={previewStyle} />
        </div>
      </div>
    </div>
  );
}
