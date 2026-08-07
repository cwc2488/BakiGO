"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import { readImageFileAsJpegDataUrl } from "@/lib/images/image-file-utils";
import type { ProgressPhotoAngle, ProgressPhotoRecord } from "@/types/member-workspace";
import { PROGRESS_PHOTO_ANGLE_LABELS } from "@/types/member-workspace";
import { useState } from "react";
import { CrmButton, CrmCard, CrmInput, CrmSectionTitle, CrmSelect, CrmTextarea } from "../ui";
import { ImageUploadButtons, ImageUploadSectionButton } from "@/components/ui/ImageUploadButtons";

export interface ProgressPhotoFormValues {
  photoDate: string;
  angle: ProgressPhotoAngle;
  note: string;
  imageDataUrl: string | null;
}

function emptyForm(today: string): ProgressPhotoFormValues {
  return {
    photoDate: today,
    angle: "front",
    note: "",
    imageDataUrl: null,
  };
}

export function ProgressPhotoSection({
  photos,
  today,
  onCreate,
}: {
  photos: ProgressPhotoRecord[];
  today: string;
  onCreate: (values: ProgressPhotoFormValues) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProgressPhotoFormValues>(() => emptyForm(today));
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (file: File) => {
    setUploadError(null);
    setIsUploading(true);
    try {
      const imageDataUrl = await readImageFileAsJpegDataUrl(file);
      setForm((current) => ({ ...current, imageDataUrl }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "無法讀取照片");
      setForm((current) => ({ ...current, imageDataUrl: null }));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onCreate(form);
    setForm(emptyForm(today));
    setShowForm(false);
  };

  return (
    <CrmCard>
      <div className="flex items-center justify-between gap-4">
        <CrmSectionTitle>進度照片</CrmSectionTitle>
        <ImageUploadSectionButton
          active={showForm}
          inactiveLabel="上傳照片"
          onClick={() => setShowForm((current) => !current)}
        />
      </div>

      {showForm ? (
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <CrmInput
            label="日期"
            required
            type="date"
            value={form.photoDate}
            onChange={(event) =>
              setForm((current) => ({ ...current, photoDate: event.target.value }))
            }
          />
          <CrmSelect
            label="角度"
            value={form.angle}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                angle: event.target.value as ProgressPhotoAngle,
              }))
            }
          >
            {(Object.keys(PROGRESS_PHOTO_ANGLE_LABELS) as ProgressPhotoAngle[]).map((angle) => (
              <option key={angle} value={angle}>
                {PROGRESS_PHOTO_ANGLE_LABELS[angle]}
              </option>
            ))}
          </CrmSelect>
          <ImageUploadButtons
            disabled={isUploading}
            label="照片"
            onFileSelect={handleFileSelect}
          />
          {isUploading ? (
            <p className="text-[0.8125rem] text-[#86868b]">照片處理中…</p>
          ) : null}
          {uploadError ? <p className="text-[0.8125rem] text-[#cf1322]">{uploadError}</p> : null}
          {form.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="預覽"
              className="max-h-48 rounded-2xl object-cover"
              src={form.imageDataUrl}
            />
          ) : null}
          <CrmTextarea
            label="備註"
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          />
          <CrmButton disabled={!form.imageDataUrl || isUploading} type="submit">
            儲存照片
          </CrmButton>
        </form>
      ) : null}

      <div className="mt-4 space-y-4">
        {photos.length > 0 ? (
          photos.map((photo) => (
            <article key={photo.id} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                  {PROGRESS_PHOTO_ANGLE_LABELS[photo.angle]}
                </p>
                <time className="text-[0.8125rem] text-[#86868b]">
                  {formatShortDate(photo.photoDate)}
                </time>
              </div>
              {photo.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={PROGRESS_PHOTO_ANGLE_LABELS[photo.angle]}
                  className="mt-3 max-h-56 w-full rounded-2xl object-cover"
                  src={photo.imageDataUrl}
                />
              ) : (
                <p className="mt-3 text-[0.875rem] text-[#86868b]">無照片</p>
              )}
              {photo.note ? (
                <p className="mt-2 text-[0.875rem] text-[#86868b]">{photo.note}</p>
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-[0.9375rem] text-[#86868b]">尚無進度照片</p>
        )}
      </div>
    </CrmCard>
  );
}
