"use client";

import {
  downloadBlob,
  generatePreMeetingGraphicBlob,
  loadImageFromFile,
} from "@/lib/pre-meeting-graphic/generate-pre-meeting-graphic";
import {
  EMPTY_PRE_MEETING_GRAPHIC_INPUT,
  type PreMeetingGraphicInput,
  type PreMeetingGraphicLayout,
} from "@/types/pre-meeting-graphic";
import Link from "next/link";
import { useMemo, useState } from "react";

const FIELD_GROUPS: Array<{
  title: string;
  fields: Array<{ key: keyof PreMeetingGraphicInput; label: string; multiline?: boolean }>;
}> = [
  {
    title: "邀約資訊",
    fields: [
      { key: "inviter", label: "邀約人" },
      { key: "invitingStore", label: "邀約店家" },
      { key: "consultingStore", label: "諮詢店家" },
      { key: "uplinePerformance", label: "上線績優" },
      { key: "appointmentDateTime", label: "邀約日期" },
    ],
  },
  {
    title: "客人資料",
    fields: [
      { key: "customerName", label: "客人名字" },
      { key: "phone", label: "電話" },
      { key: "region", label: "居住地區" },
      { key: "background", label: "背景" },
      { key: "age", label: "年齡" },
      { key: "source", label: "來源" },
      { key: "need", label: "需求" },
      { key: "heightWeight", label: "身高/體重" },
      { key: "targetWeightLoss", label: "想減的體重數" },
      { key: "determination", label: "決心" },
    ],
  },
  {
    title: "會前重點",
    fields: [
      { key: "bodyDissatisfaction", label: "身體哪裡不滿意", multiline: true },
      { key: "triedBefore", label: "試過", multiline: true },
      { key: "closingGoal", label: "希望締結", multiline: true },
      { key: "additionalNotes", label: "補充說明", multiline: true },
    ],
  },
];

export default function PreMeetingGraphicPage() {
  const [form, setForm] = useState<PreMeetingGraphicInput>(EMPTY_PRE_MEETING_GRAPHIC_INPUT);
  const [layout, setLayout] = useState<PreMeetingGraphicLayout>("overlay");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const canGenerate = Boolean(photoFile && form.customerName.trim());

  const layoutOptions = useMemo(
    () =>
      [
        { value: "overlay" as const, label: "照片底圖 + 白框文字" },
        { value: "circle" as const, label: "圓形照片 + 下方文字" },
      ] as const,
    [],
  );

  function updateField(key: keyof PreMeetingGraphicInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPreviewUrl(null);
  }

  async function handleGenerate() {
    if (!photoFile) {
      setStatusMessage("請先上傳照片");
      return;
    }

    setIsGenerating(true);
    setStatusMessage(null);

    try {
      const photo = await loadImageFromFile(photoFile);
      const blob = await generatePreMeetingGraphicBlob({ photo, form, layout });
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(blob));
      setStatusMessage("預覽已更新，可下載圖片");
    } catch (caught) {
      setStatusMessage(caught instanceof Error ? caught.message : "產生圖片失敗");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDownload() {
    if (!photoFile) {
      return;
    }

    setIsGenerating(true);
    try {
      const photo = await loadImageFromFile(photoFile);
      const blob = await generatePreMeetingGraphicBlob({ photo, form, layout });
      const safeName = form.customerName.trim() || "會前會";
      downloadBlob(blob, `${safeName}-會前會圖.png`);
      setStatusMessage("圖片已下載");
    } catch (caught) {
      setStatusMessage(caught instanceof Error ? caught.message : "下載失敗");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-full bg-[var(--brand-bg)]">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pb-24 pt-12">
        <header className="space-y-2">
          <Link className="inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)]" href="/">
            ← 返回首頁
          </Link>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#1d1d1f]">會前會圖製作</h1>
          <p className="text-[0.9375rem] text-[#86868b]">
            填寫資料、上傳照片，合併輸出會前會分享圖
          </p>
        </header>

        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">照片與版型</p>
          <label className="mt-3 block">
            <span className="text-[0.8125rem] font-medium text-[#86868b]">上傳照片</span>
            <input
              accept="image/*"
              className="mt-2 block w-full text-[0.875rem]"
              onChange={handlePhotoChange}
              type="file"
            />
          </label>
          {photoPreviewUrl ? (
            <img
              alt="上傳預覽"
              className="mt-3 max-h-48 w-full rounded-2xl object-cover"
              src={photoPreviewUrl}
            />
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {layoutOptions.map((option) => (
              <button
                key={option.value}
                className={`rounded-xl px-3 py-2 text-[0.8125rem] font-medium ${
                  layout === option.value
                    ? "bg-[var(--brand-primary-light)] text-[var(--brand-primary-dark)]"
                    : "bg-[var(--brand-bg)] text-[#636366]"
                }`}
                onClick={() => setLayout(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {FIELD_GROUPS.map((group) => (
          <section
            key={group.title}
            className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5"
          >
            <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">{group.title}</p>
            <div className="mt-4 space-y-3">
              {group.fields.map((field) => (
                <label key={field.key} className="block space-y-1.5">
                  <span className="text-[0.8125rem] font-medium text-[#86868b]">{field.label}</span>
                  {field.multiline ? (
                    <textarea
                      className="min-h-[5rem] w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-3 text-[0.9375rem] outline-none focus:border-[var(--brand-primary)]"
                      onChange={(event) => updateField(field.key, event.target.value)}
                      value={form[field.key]}
                    />
                  ) : (
                    <input
                      className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-3 text-[0.9375rem] outline-none focus:border-[var(--brand-primary)]"
                      onChange={(event) => updateField(field.key, event.target.value)}
                      value={form[field.key]}
                    />
                  )}
                </label>
              ))}
            </div>
          </section>
        ))}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="flex-1 rounded-2xl bg-[var(--brand-primary)] px-4 py-3.5 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
            disabled={!canGenerate || isGenerating}
            onClick={() => void handleGenerate()}
            type="button"
          >
            {isGenerating ? "產生中…" : "產生預覽"}
          </button>
          <button
            className="flex-1 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 text-[0.9375rem] font-semibold text-[#1d1d1f] disabled:opacity-50"
            disabled={!canGenerate || isGenerating}
            onClick={() => void handleDownload()}
            type="button"
          >
            下載圖片
          </button>
        </div>

        {statusMessage ? (
          <p className="rounded-xl bg-[var(--brand-primary-light)] px-4 py-3 text-[0.875rem] text-[var(--brand-primary-dark)]">
            {statusMessage}
          </p>
        ) : null}

        {previewUrl ? (
          <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
            <p className="mb-3 text-[0.875rem] font-semibold text-[#1d1d1f]">輸出預覽</p>
            <img alt="會前會圖預覽" className="w-full rounded-2xl" src={previewUrl} />
          </section>
        ) : null}
      </main>
    </div>
  );
}
