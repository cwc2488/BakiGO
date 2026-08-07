"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import { computeAgeFromBirthYear } from "@/lib/customers/body-metrics";
import type { BodyCompositionRecord } from "@/types/customer";
import { useEffect, useState } from "react";
import { CrmButton, CrmCard, CrmInput, CrmSectionTitle, CrmTextarea } from "@/components/members/ui";

export interface CustomerBodyFormValues {
  recordDate: string;
  age: string;
  weightKg: string;
  skeletalMuscleKg: string;
  bodyFatKg: string;
  bmi: string;
  bodyFatPercent: string;
  visceralFatLevel: string;
  basalMetabolicRate: string;
  bodyAge: string;
  note: string;
}

function emptyForm(today: string): CustomerBodyFormValues {
  return {
    recordDate: today,
    age: "",
    weightKg: "",
    skeletalMuscleKg: "",
    bodyFatKg: "",
    bmi: "",
    bodyFatPercent: "",
    visceralFatLevel: "",
    basalMetabolicRate: "",
    bodyAge: "",
    note: "",
  };
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRecordSummary(record: BodyCompositionRecord): string {
  const parts: string[] = [];
  if (record.weightKg !== null) {
    parts.push(`${record.weightKg} kg`);
  }
  if (record.bodyFatPercent !== null) {
    parts.push(`體脂 ${record.bodyFatPercent}%`);
  }
  if (record.bodyAge !== null) {
    parts.push(`身體年齡 ${record.bodyAge}`);
  }
  return parts.join(" · ") || "體組成紀錄";
}

export function CustomerBodySection({
  records,
  today,
  birthYear,
  onCreate,
}: {
  records: BodyCompositionRecord[];
  today: string;
  birthYear?: number;
  onCreate: (values: CustomerBodyFormValues) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CustomerBodyFormValues>(() => emptyForm(today));

  useEffect(() => {
    if (!showForm || !birthYear) {
      return;
    }

    const suggestedAge = computeAgeFromBirthYear(birthYear, form.recordDate);
    if (suggestedAge === null) {
      return;
    }

    setForm((current) =>
      current.age.trim() ? current : { ...current, age: String(suggestedAge) },
    );
  }, [birthYear, form.recordDate, showForm]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onCreate(form);
    setForm(emptyForm(today));
    setShowForm(false);
  };

  const updateField = (field: keyof CustomerBodyFormValues, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "recordDate" && birthYear && !current.age.trim()) {
        const suggestedAge = computeAgeFromBirthYear(birthYear, value);
        if (suggestedAge !== null) {
          next.age = String(suggestedAge);
        }
      }
      return next;
    });
  };

  return (
    <CrmCard>
      <div className="flex items-center justify-between gap-4">
        <CrmSectionTitle>體組成</CrmSectionTitle>
        <button
          className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
          onClick={() => setShowForm((current) => !current)}
          type="button"
        >
          {showForm ? "取消" : "新增量測"}
        </button>
      </div>

      {showForm ? (
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <CrmInput
            label="日期"
            required
            type="date"
            value={form.recordDate}
            onChange={(event) => updateField("recordDate", event.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <CrmInput
              label="年齡"
              inputMode="numeric"
              value={form.age}
              onChange={(event) => updateField("age", event.target.value)}
            />
            <CrmInput
              label="體重 (kg)"
              inputMode="decimal"
              value={form.weightKg}
              onChange={(event) => updateField("weightKg", event.target.value)}
            />
            <CrmInput
              label="骨骼肌 (kg)"
              inputMode="decimal"
              value={form.skeletalMuscleKg}
              onChange={(event) => updateField("skeletalMuscleKg", event.target.value)}
            />
            <CrmInput
              label="體脂肪 (kg)"
              inputMode="decimal"
              value={form.bodyFatKg}
              onChange={(event) => updateField("bodyFatKg", event.target.value)}
            />
            <CrmInput
              label="BMI"
              inputMode="decimal"
              value={form.bmi}
              onChange={(event) => updateField("bmi", event.target.value)}
            />
            <CrmInput
              label="體脂率 (%)"
              inputMode="decimal"
              value={form.bodyFatPercent}
              onChange={(event) => updateField("bodyFatPercent", event.target.value)}
            />
            <CrmInput
              label="內臟脂肪"
              inputMode="decimal"
              value={form.visceralFatLevel}
              onChange={(event) => updateField("visceralFatLevel", event.target.value)}
            />
            <CrmInput
              label="基礎代謝"
              inputMode="decimal"
              value={form.basalMetabolicRate}
              onChange={(event) => updateField("basalMetabolicRate", event.target.value)}
            />
            <CrmInput
              label="身體年齡"
              inputMode="numeric"
              value={form.bodyAge}
              onChange={(event) => updateField("bodyAge", event.target.value)}
            />
          </div>
          <CrmTextarea
            label="備註"
            value={form.note}
            onChange={(event) => updateField("note", event.target.value)}
          />
          <CrmButton type="submit">儲存量測</CrmButton>
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
                {record.age !== null ? (
                  <>
                    <dt>年齡</dt>
                    <dd className="text-right text-[#1d1d1f]">{record.age}</dd>
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
              </dl>
              {record.note ? (
                <p className="mt-2 text-[0.875rem] text-[#86868b]">{record.note}</p>
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-[0.9375rem] text-[#86868b]">尚無體組成紀錄</p>
        )}
      </div>
    </CrmCard>
  );
}

export { parseNumber as parseCustomerBodyNumber };
