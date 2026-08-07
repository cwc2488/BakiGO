"use client";

import { CUSTOMER_RECEIPT_RETENTION_YEARS } from "@/lib/customers/customer-receipt-retention";
import {
  getSaveToPhotoLibraryLabel,
  getSaveToPhotoLibrarySuccessMessage,
  readImageFileAsJpegDataUrl,
  saveDataUrlToPhotoLibrary,
} from "@/lib/images/image-file-utils";
import { formatShortDate } from "@/lib/mission-control/format";
import type { CustomerReceiptPhoto } from "@/types/customer";
import { useState } from "react";
import { CrmButton, CrmCard, CrmInput, CrmSectionTitle, CrmTextarea } from "@/components/members/ui";
import { ImageUploadButtons, ImageUploadSectionButton } from "@/components/ui/ImageUploadButtons";

export interface CustomerReceiptPhotoFormValues {
  receiptDate: string;
  note: string;
  imageDataUrl: string | null;
}

function emptyForm(today: string): CustomerReceiptPhotoFormValues {
  return {
    receiptDate: today,
    note: "",
    imageDataUrl: null,
  };
}

export function CustomerReceiptPhotoSection({
  receipts,
  today,
  onCreate,
}: {
  receipts: CustomerReceiptPhoto[];
  today: string;
  onCreate: (values: CustomerReceiptPhotoFormValues) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CustomerReceiptPhotoFormValues>(() => emptyForm(today));
  const [viewerReceipt, setViewerReceipt] = useState<CustomerReceiptPhoto | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSaveReceipt = async (receipt: CustomerReceiptPhoto) => {
    if (!receipt.imageDataUrl) {
      return;
    }

    setSaveMessage(null);
    setIsSaving(true);
    try {
      const method = await saveDataUrlToPhotoLibrary(
        receipt.imageDataUrl,
        `收據-${receipt.receiptDate}.jpg`,
      );
      setSaveMessage(getSaveToPhotoLibrarySuccessMessage(method));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setSaveMessage(error instanceof Error ? error.message : "無法儲存收據");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.imageDataUrl) {
      return;
    }
    onCreate(form);
    setForm(emptyForm(today));
    setShowForm(false);
  };

  return (
    <>
      <CrmCard>
        <div className="flex items-center justify-between gap-4">
          <CrmSectionTitle>收據留存</CrmSectionTitle>
          <ImageUploadSectionButton
            active={showForm}
            inactiveLabel="拍照上傳收據"
            onClick={() => setShowForm((current) => !current)}
          />
        </div>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#86868b]">
          收據拍照後保存 {CUSTOMER_RECEIPT_RETENTION_YEARS} 年，期間可隨時調閱；到期後自動刪除。支援 JPG、PNG、HEIC 等常見格式。
        </p>

        {showForm ? (
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <CrmInput
              label="收據日期"
              onChange={(event) =>
                setForm((current) => ({ ...current, receiptDate: event.target.value }))
              }
              required
              type="date"
              value={form.receiptDate}
            />
            <ImageUploadButtons
              cameraLabel="拍照收據"
              disabled={isUploading}
              label="收據照片"
              libraryLabel="從相簿選擇"
              onFileSelect={handleFileSelect}
            />
            {isUploading ? (
              <p className="text-[0.8125rem] text-[#86868b]">照片處理中…</p>
            ) : null}
            {uploadError ? <p className="text-[0.8125rem] text-[#cf1322]">{uploadError}</p> : null}
            {form.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="收據預覽"
                className="max-h-56 w-full rounded-2xl object-contain bg-[var(--brand-bg)]"
                src={form.imageDataUrl}
              />
            ) : null}
            <CrmTextarea
              label="備註（選填）"
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              value={form.note}
            />
            <CrmButton disabled={!form.imageDataUrl || isUploading} type="submit">
              儲存收據
            </CrmButton>
          </form>
        ) : null}

        <div className="mt-4 space-y-4">
          {receipts.length > 0 ? (
            receipts.map((receipt) => (
              <article key={receipt.id} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                      收據 {formatShortDate(receipt.receiptDate)}
                    </p>
                    <p className="mt-1 text-[0.8125rem] text-[#86868b]">
                      保存至 {formatShortDate(receipt.retainUntil)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      className="rounded-full bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
                      onClick={() => {
                        setSaveMessage(null);
                        setViewerReceipt(receipt);
                      }}
                      type="button"
                    >
                      查看
                    </button>
                    <button
                      className="rounded-full bg-[#1d1d1f] px-3 py-1.5 text-[0.8125rem] font-medium text-white disabled:opacity-60"
                      disabled={isSaving}
                      onClick={() => void handleSaveReceipt(receipt)}
                      type="button"
                    >
                      {getSaveToPhotoLibraryLabel()}
                    </button>
                  </div>
                </div>
                {receipt.note ? (
                  <p className="mt-2 text-[0.8125rem] text-[#636366]">{receipt.note}</p>
                ) : null}
                {receipt.imageDataUrl ? (
                  <button
                    className="mt-3 block w-full"
                    onClick={() => setViewerReceipt(receipt)}
                    type="button"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={`收據 ${receipt.receiptDate}`}
                      className="max-h-40 w-full rounded-2xl object-contain bg-white"
                      src={receipt.imageDataUrl}
                    />
                  </button>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-[0.9375rem] text-[#86868b]">尚無收據照片</p>
          )}
        </div>
        {saveMessage ? (
          <p className="mt-3 text-[0.8125rem] text-[var(--brand-primary-dark)]">{saveMessage}</p>
        ) : null}
      </CrmCard>

      {viewerReceipt?.imageDataUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
          onClick={() => {
            setViewerReceipt(null);
            setSaveMessage(null);
          }}
          role="presentation"
        >
          <div
            className="max-h-full w-full max-w-3xl overflow-auto rounded-[1.75rem] bg-[var(--brand-surface)] p-4"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[1rem] font-semibold text-[#1d1d1f]">
                  收據 {formatShortDate(viewerReceipt.receiptDate)}
                </p>
                <p className="mt-1 text-[0.8125rem] text-[#86868b]">
                  保存至 {formatShortDate(viewerReceipt.retainUntil)}
                </p>
              </div>
              <button
                className="rounded-full bg-[var(--brand-bg)] px-4 py-2 text-[0.8125rem] font-medium text-[#636366]"
                onClick={() => {
                  setViewerReceipt(null);
                  setSaveMessage(null);
                }}
                type="button"
              >
                關閉
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`收據 ${viewerReceipt.receiptDate}`}
              className="mt-4 max-h-[70vh] w-full rounded-2xl object-contain bg-[var(--brand-bg)]"
              src={viewerReceipt.imageDataUrl}
            />
            {viewerReceipt.note ? (
              <p className="mt-3 text-[0.875rem] text-[#636366]">{viewerReceipt.note}</p>
            ) : null}
            <button
              className="mt-4 w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[0.9375rem] font-semibold text-white disabled:opacity-60"
              disabled={isSaving}
              onClick={() => void handleSaveReceipt(viewerReceipt)}
              type="button"
            >
              {isSaving ? "處理中…" : getSaveToPhotoLibraryLabel()}
            </button>
            {saveMessage ? (
              <p className="mt-2 text-[0.8125rem] text-[var(--brand-primary-dark)]">{saveMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
