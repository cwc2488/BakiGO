"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import { computeAgeFromCustomerProfile, computeBmi } from "@/lib/customers/body-metrics";
import {
  bodyRecordToFormValues,
  emptyCustomerBodyForm,
  parseCustomerBodyNumber,
  type CustomerBodyFormValues,
} from "@/lib/customers/customer-body-form";
import type { BodyCompositionRecord } from "@/types/customer";
import { useEffect, useMemo, useState } from "react";
import { CrmButton, CrmCard, CrmInput, CrmSectionTitle, CrmTextarea } from "@/components/members/ui";
import { ImageUploadSectionButton } from "@/components/ui/ImageUploadButtons";

export type { CustomerBodyFormValues };
export { parseCustomerBodyNumber };

function emptyForm(today: string): CustomerBodyFormValues {
  return emptyCustomerBodyForm(today);
}

function parseNumber(value: string): number | null {
  return parseCustomerBodyNumber(value);
}

function formatRecordSummary(record: BodyCompositionRecord): string {
  const parts: string[] = [];
  if (record.weightKg !== null) {
    parts.push(`${record.weightKg} kg`);
  }
  if (record.bodyFatPercent !== null) {
    parts.push(`體脂 ${record.bodyFatPercent}%`);
  }
  if (record.skeletalMuscleKg !== null) {
    parts.push(`骨骼肌 ${record.skeletalMuscleKg} kg`);
  }
  return parts.join(" · ") || "體組成紀錄";
}

export function CustomerBodySection({
  records,
  today,
  birthYear,
  birthDate,
  heightCm,
  onCreate,
  onUpdate,
  onDelete,
}: {
  records: BodyCompositionRecord[];
  today: string;
  birthYear?: number;
  birthDate?: string;
  heightCm?: number;
  onCreate: (values: CustomerBodyFormValues) => void | Promise<void>;
  onUpdate: (recordId: string, values: CustomerBodyFormValues) => void | Promise<void>;
  onDelete: (recordId: string) => void | Promise<void>;
}) {
  const [showForm, setShowForm] = useState(records.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerBodyFormValues>(() => emptyForm(today));
  const [busy, setBusy] = useState(false);

  const suggestedAge = useMemo(
    () => computeAgeFromCustomerProfile({ birthDate, birthYear }, form.recordDate),
    [birthDate, birthYear, form.recordDate],
  );

  const autoBmi = useMemo(
    () => computeBmi(parseNumber(form.weightKg), heightCm ?? null),
    [form.weightKg, heightCm],
  );

  useEffect(() => {
    if (!showForm || !(birthDate || birthYear) || form.age.trim()) {
      return;
    }

    if (suggestedAge !== null) {
      setForm((current) => ({ ...current, age: String(suggestedAge) }));
    }
  }, [birthDate, birthYear, form.age, showForm, suggestedAge]);

  useEffect(() => {
    if (autoBmi === null) {
      return;
    }

    setForm((current) => ({ ...current, bmi: String(autoBmi) }));
  }, [autoBmi]);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm(today));
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(today));
    setShowForm(true);
  };

  const openEdit = (record: BodyCompositionRecord) => {
    setEditingId(record.id);
    setForm(bodyRecordToFormValues(record));
    setShowForm(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await onUpdate(editingId, form);
      } else {
        await onCreate(form);
      }
      closeForm();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    if (busy) {
      return;
    }
    if (!window.confirm("確定要刪除這筆量測？刪除後無法復原。")) {
      return;
    }
    setBusy(true);
    try {
      await onDelete(recordId);
      if (editingId === recordId) {
        closeForm();
      }
    } finally {
      setBusy(false);
    }
  };

  const updateField = (field: keyof CustomerBodyFormValues, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "recordDate" && !current.age.trim()) {
        const age = computeAgeFromCustomerProfile({ birthDate, birthYear }, value);
        if (age !== null) {
          next.age = String(age);
        }
      }
      return next;
    });
  };

  return (
    <CrmCard>
      <div className="flex items-center justify-between gap-4">
        <div>
          <CrmSectionTitle>體組成量測</CrmSectionTitle>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">
            依 InBody 報告填入各項數據，有身高時 BMI 會自動計算。
          </p>
        </div>
        <ImageUploadSectionButton
          active={showForm && !editingId}
          inactiveLabel={records.length === 0 ? "記錄量測" : "新增量測"}
          onClick={() => {
            if (showForm && !editingId) {
              closeForm();
            } else {
              openCreate();
            }
          }}
        />
      </div>

      {!heightCm ? (
        <p className="mt-3 rounded-2xl bg-[#fff7e6] px-4 py-3 text-[0.8125rem] text-[#d46b08]">
          尚未設定身高，BMI 無法自動計算。請在下方「基本資料」補上身高。
        </p>
      ) : null}

      {showForm ? (
        <form className="mt-4 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <p className="text-[0.8125rem] font-semibold text-[#636366]">
            {editingId ? "編輯量測" : "新增量測"}
          </p>
          <CrmInput
            label="量測日期"
            onChange={(event) => updateField("recordDate", event.target.value)}
            required
            type="date"
            value={form.recordDate}
          />

          {birthDate || birthYear ? (
            suggestedAge !== null ? (
              <p className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3 text-[0.8125rem] text-[#636366]">
                年齡：<span className="font-semibold text-[#1d1d1f]">{suggestedAge} 歲</span>
                <span className="text-[#86868b]">（依顧客生日自動計算）</span>
              </p>
            ) : null
          ) : (
            <CrmInput
              inputMode="numeric"
              label="年齡（選填）"
              onChange={(event) => updateField("age", event.target.value)}
              value={form.age}
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CrmInput
              inputMode="decimal"
              label="體重 (kg)"
              onChange={(event) => updateField("weightKg", event.target.value)}
              value={form.weightKg}
            />
            <CrmInput
              inputMode="decimal"
              label="體脂率 (%)"
              onChange={(event) => updateField("bodyFatPercent", event.target.value)}
              value={form.bodyFatPercent}
            />
            <CrmInput
              inputMode="decimal"
              label="骨骼肌 (kg)"
              onChange={(event) => updateField("skeletalMuscleKg", event.target.value)}
              value={form.skeletalMuscleKg}
            />
            <CrmInput
              inputMode="decimal"
              label={autoBmi !== null ? "BMI（自動）" : "BMI"}
              onChange={(event) => updateField("bmi", event.target.value)}
              value={form.bmi}
            />
            <CrmInput
              inputMode="decimal"
              label="內臟脂肪"
              onChange={(event) => updateField("visceralFatLevel", event.target.value)}
              value={form.visceralFatLevel}
            />
            <CrmInput
              inputMode="decimal"
              label="基礎代謝"
              onChange={(event) => updateField("basalMetabolicRate", event.target.value)}
              value={form.basalMetabolicRate}
            />
            <CrmInput
              inputMode="numeric"
              label="身體年齡"
              onChange={(event) => updateField("bodyAge", event.target.value)}
              value={form.bodyAge}
            />
          </div>

          <CrmTextarea
            label="備註"
            onChange={(event) => updateField("note", event.target.value)}
            value={form.note}
          />
          <div className="flex flex-wrap gap-2">
            <CrmButton disabled={busy} type="submit">
              {editingId ? "儲存修改" : "儲存量測"}
            </CrmButton>
            <button
              className="rounded-2xl border border-[var(--brand-border)] px-4 py-2.5 text-[0.875rem] font-semibold text-[#636366]"
              disabled={busy}
              onClick={closeForm}
              type="button"
            >
              取消
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 space-y-3">
        {records.length > 0 ? (
          records.map((record) => (
            <article key={record.id} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                  {formatRecordSummary(record)}
                </p>
                <time className="text-[0.8125rem] text-[#86868b]">
                  {formatShortDate(record.recordDate)}
                </time>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.8125rem] text-[#86868b]">
                {record.bmi !== null ? (
                  <>
                    <dt>BMI</dt>
                    <dd className="text-right text-[#1d1d1f]">{record.bmi}</dd>
                  </>
                ) : null}
                {record.visceralFatLevel !== null ? (
                  <>
                    <dt>內臟脂肪</dt>
                    <dd className="text-right text-[#1d1d1f]">{record.visceralFatLevel}</dd>
                  </>
                ) : null}
                {record.basalMetabolicRate !== null ? (
                  <>
                    <dt>基礎代謝</dt>
                    <dd className="text-right text-[#1d1d1f]">{record.basalMetabolicRate}</dd>
                  </>
                ) : null}
                {record.bodyAge !== null ? (
                  <>
                    <dt>身體年齡</dt>
                    <dd className="text-right text-[#1d1d1f]">{record.bodyAge}</dd>
                  </>
                ) : null}
              </dl>
              {record.note ? (
                <p className="mt-2 text-[0.875rem] text-[#86868b]">{record.note}</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-[0.8125rem] font-semibold text-[#1d1d1f]"
                  disabled={busy}
                  onClick={() => openEdit(record)}
                  type="button"
                >
                  編輯量測
                </button>
                <button
                  className="rounded-xl border border-[#ff375f]/40 bg-white px-3 py-2 text-[0.8125rem] font-semibold text-[#ff375f]"
                  disabled={busy}
                  onClick={() => void handleDelete(record.id)}
                  type="button"
                >
                  刪除量測
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="text-[0.9375rem] text-[#86868b]">尚無量測紀錄，點上方「記錄量測」開始。</p>
        )}
      </div>
    </CrmCard>
  );
}
