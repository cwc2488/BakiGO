"use client";

import { CUSTOMER_RECEIPT_RETENTION_YEARS } from "@/lib/customers/customer-receipt-retention";
import { formatShortDate } from "@/lib/mission-control/format";
import type { CustomerReceiptPhoto } from "@/types/customer";
import { useState } from "react";
import { CrmButton, CrmCard, CrmInput, CrmSectionTitle, CrmTextarea } from "@/components/members/ui";

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
    event.target.value = "";
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
          <button
            className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
            onClick={() => setShowForm((current) => !current)}
            type="button"
          >
            {showForm ? "取消" : "拍照上傳"}
          </button>
        </div>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#86868b]">
          收據拍照後保存 {CUSTOMER_RECEIPT_RETENTION_YEARS} 年，期間可隨時調閱；到期後自動刪除。
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
            <label className="block space-y-2">
              <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">收據照片</span>
              <input
                accept="image/*"
                capture="environment"
                className="block w-full text-[0.875rem] text-[#636366]"
                onChange={handleFileChange}
                required={!form.imageDataUrl}
                type="file"
              />
            </label>
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
            <CrmButton disabled={!form.imageDataUrl} type="submit">
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
                  <button
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
                    onClick={() => setViewerReceipt(receipt)}
                    type="button"
                  >
                    查看
                  </button>
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
      </CrmCard>

      {viewerReceipt?.imageDataUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
          onClick={() => setViewerReceipt(null)}
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
                onClick={() => setViewerReceipt(null)}
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
          </div>
        </div>
      ) : null}
    </>
  );
}
