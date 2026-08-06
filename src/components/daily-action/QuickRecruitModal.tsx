"use client";

import {
  QUICK_RECRUIT_CATEGORY_LABELS,
  type QuickRecruitCategory,
  type QuickRecruitInput,
} from "@/lib/daily-action/create-quick-recruit";
import { RegionField } from "@/components/ui/RegionField";
import { MobileFormModal } from "@/components/ui/MobileFormModal";
import { useState } from "react";

const EMPTY_FORM: QuickRecruitInput = {
  displayName: "",
  phone: "",
  region: "",
  category: "distributor",
  note: "",
};

export function QuickRecruitModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: QuickRecruitInput) => Promise<void>;
}) {
  const [form, setForm] = useState<QuickRecruitInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!open) {
    return null;
  }

  function resetAndClose() {
    setForm(EMPTY_FORM);
    setError(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.displayName.trim()) {
      setError("請輸入姓名");
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        displayName: form.displayName.trim(),
        phone: form.phone?.trim() || undefined,
        region: form.region?.trim() || undefined,
        category: form.category,
        note: form.note?.trim() || undefined,
      });
      setForm(EMPTY_FORM);
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
          disabled={isSaving || !form.displayName.trim()}
          form="quick-recruit-form"
          type="submit"
        >
          {isSaving ? "儲存中…" : "確認招募"}
        </button>
      }
      onClose={resetAndClose}
      open
      title="招募會員"
    >
      <form className="space-y-4" id="quick-recruit-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">姓名</span>
          <input
            autoFocus
            className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
            placeholder="新夥伴姓名"
            value={form.displayName}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">電話</span>
          <input
            className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            inputMode="tel"
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            placeholder="選填"
            type="tel"
            value={form.phone ?? ""}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">地區</span>
          <RegionField
            onChange={(region) => setForm((current) => ({ ...current, region }))}
            value={form.region ?? ""}
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-[0.875rem] font-medium text-[#636366]">分類</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(QUICK_RECRUIT_CATEGORY_LABELS) as QuickRecruitCategory[]).map((key) => (
              <label
                key={key}
                className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-3 text-[0.9375rem] font-medium ${
                  form.category === key
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary-light)] text-[var(--brand-primary-dark)]"
                    : "border-[var(--brand-border)] bg-[var(--brand-bg)] text-[#636366]"
                }`}
              >
                <input
                  checked={form.category === key}
                  className="sr-only"
                  name="recruit-category"
                  onChange={() => setForm((current) => ({ ...current, category: key }))}
                  type="radio"
                  value={key}
                />
                {QUICK_RECRUIT_CATEGORY_LABELS[key]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">備註</span>
          <textarea
            className="min-h-[4rem] w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            placeholder="選填"
            value={form.note ?? ""}
          />
        </label>

        <p className="text-[0.8125rem] leading-relaxed text-[#86868b]">
          直銷商會同步計入超級聯賽與新會員 VP；優惠顧客會建立夥伴檔案並計入第一代人數。
        </p>

        {error ? <p className="text-[0.875rem] text-[#ff375f]">{error}</p> : null}
      </form>
    </MobileFormModal>
  );
}
