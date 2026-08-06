"use client";

import type { QuickActivityInput } from "@/lib/daily-action/log-today-action";
import { RegionField } from "@/components/ui/RegionField";
import { MobileFormModal } from "@/components/ui/MobileFormModal";
import { useState } from "react";

const EMPTY_FORM: QuickActivityInput = {
  customerName: "",
  customerPhone: "",
  region: "",
  note: "",
};

function QuickActivityModalForm({
  activityType,
  onClose,
  onSubmit,
}: {
  activityType: "measurement" | "consultation";
  onClose: () => void;
  onSubmit: (activityType: "measurement" | "consultation", input: QuickActivityInput) => Promise<void>;
}) {
  const [form, setForm] = useState<QuickActivityInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const title = activityType === "measurement" ? "快速量測" : "快速諮詢";
  const submitLabel = activityType === "measurement" ? "確認量測" : "確認諮詢";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.customerName.trim()) {
      setError("請輸入姓名");
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit(activityType, {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone?.trim() || undefined,
        region: form.region?.trim() || undefined,
        note: form.note?.trim() || undefined,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "儲存失敗，請稍後再試");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <MobileFormModal
      footer={
        <button
          className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3.5 text-[1rem] font-semibold text-white disabled:opacity-50"
          disabled={isSaving || !form.customerName.trim()}
          form="quick-activity-form"
          type="submit"
        >
          {isSaving ? "儲存中…" : submitLabel}
        </button>
      }
      onClose={onClose}
      open
      title={title}
    >
      <form className="space-y-4" id="quick-activity-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">姓名</span>
          <input
            autoFocus
            className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
            placeholder="對象姓名"
            value={form.customerName}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">電話</span>
          <input
            className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            inputMode="tel"
            onChange={(event) => setForm((current) => ({ ...current, customerPhone: event.target.value }))}
            placeholder="選填"
            type="tel"
            value={form.customerPhone ?? ""}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">地區</span>
          <RegionField
            onChange={(region) => setForm((current) => ({ ...current, region }))}
            value={form.region ?? ""}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">備註</span>
          <textarea
            className="min-h-[4rem] w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            placeholder="選填"
            value={form.note ?? ""}
          />
        </label>

        {error ? <p className="text-[0.875rem] text-[#ff375f]">{error}</p> : null}
      </form>
    </MobileFormModal>
  );
}

export function QuickActivityModal({
  open,
  activityType,
  onClose,
  onSubmit,
}: {
  open: boolean;
  activityType: "measurement" | "consultation" | null;
  onClose: () => void;
  onSubmit: (activityType: "measurement" | "consultation", input: QuickActivityInput) => Promise<void>;
}) {
  if (!open || !activityType) {
    return null;
  }

  return (
    <QuickActivityModalForm activityType={activityType} onClose={onClose} onSubmit={onSubmit} />
  );
}
