"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import {
  CUSTOMER_PHOTO_ANGLE_LABELS,
  CUSTOMER_PHOTO_PHASE_LABELS,
  type CustomerPhotoAngle,
  type CustomerPhotoPhase,
  type CustomerProgressPhoto,
} from "@/types/customer";
import { useState } from "react";
import { CrmButton, CrmCard, CrmInput, CrmSectionTitle, CrmSelect, CrmTextarea } from "@/components/members/ui";

export interface CustomerProgressPhotoFormValues {
  photoDate: string;
  phase: CustomerPhotoPhase;
  angle: CustomerPhotoAngle;
  note: string;
  imageDataUrl: string | null;
}

function emptyForm(today: string): CustomerProgressPhotoFormValues {
  return {
    photoDate: today,
    phase: "before",
    angle: "front",
    note: "",
    imageDataUrl: null,
  };
}

export function CustomerProgressPhotoSection({
  photos,
  today,
  onCreate,
}: {
  photos: CustomerProgressPhoto[];
  today: string;
  onCreate: (values: CustomerProgressPhotoFormValues) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CustomerProgressPhotoFormValues>(() => emptyForm(today));

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      setForm((current) => ({ ...current, imageDataUrl: result }));
    };
    reader.readAsDataURL(file);
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
        <button
          className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
          onClick={() => setShowForm((current) => !current)}
          type="button"
        >
          {showForm ? "取消" : "上傳照片"}
        </button>
      </div>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#86868b]">
        可先上傳使用前照片，之後再補使用後，就能一鍵做對照圖。
      </p>

      {showForm ? (
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <CrmSelect
            label="階段"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                phase: event.target.value as CustomerPhotoPhase,
              }))
            }
            value={form.phase}
          >
            {(Object.keys(CUSTOMER_PHOTO_PHASE_LABELS) as CustomerPhotoPhase[]).map((phase) => (
              <option key={phase} value={phase}>
                {CUSTOMER_PHOTO_PHASE_LABELS[phase]}
              </option>
            ))}
          </CrmSelect>
          <CrmInput
            label="日期"
            onChange={(event) => setForm((current) => ({ ...current, photoDate: event.target.value }))}
            required
            type="date"
            value={form.photoDate}
          />
          <CrmSelect
            label="角度"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                angle: event.target.value as CustomerPhotoAngle,
              }))
            }
            value={form.angle}
          >
            {(Object.keys(CUSTOMER_PHOTO_ANGLE_LABELS) as CustomerPhotoAngle[]).map((angle) => (
              <option key={angle} value={angle}>
                {CUSTOMER_PHOTO_ANGLE_LABELS[angle]}
              </option>
            ))}
          </CrmSelect>
          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">照片</span>
            <input
              accept="image/*"
              className="block w-full text-[0.875rem] text-[#636366]"
              onChange={handleFileChange}
              required
              type="file"
            />
          </label>
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
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            value={form.note}
          />
          <CrmButton type="submit">儲存照片</CrmButton>
        </form>
      ) : null}

      <div className="mt-4 space-y-4">
        {photos.length > 0 ? (
          photos.map((photo) => (
            <article key={photo.id} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                  {CUSTOMER_PHOTO_PHASE_LABELS[photo.phase]} · {CUSTOMER_PHOTO_ANGLE_LABELS[photo.angle]}
                </p>
                <time className="text-[0.8125rem] text-[#86868b]">
                  {formatShortDate(photo.photoDate)}
                </time>
              </div>
              {photo.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`${CUSTOMER_PHOTO_PHASE_LABELS[photo.phase]} ${CUSTOMER_PHOTO_ANGLE_LABELS[photo.angle]}`}
                  className="mt-3 max-h-56 w-full rounded-2xl object-cover"
                  src={photo.imageDataUrl}
                />
              ) : (
                <p className="mt-3 text-[0.875rem] text-[#86868b]">無照片</p>
              )}
            </article>
          ))
        ) : (
          <p className="text-[0.9375rem] text-[#86868b]">尚無進度照片</p>
        )}
      </div>
    </CrmCard>
  );
}
