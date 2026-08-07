"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import { computeAgeFromBirthYear, computeBmi } from "@/lib/customers/body-metrics";
import type { BodyCompositionRecord } from "@/types/customer";
import { useEffect, useMemo, useState } from "react";
import { CrmButton, CrmCard, CrmInput, CrmSectionTitle, CrmTextarea } from "@/components/members/ui";
import { ImageUploadSectionButton } from "@/components/ui/ImageUploadButtons";

export interface CustomerBodyFormValues {
  recordDate: string;
  age: string;
  weightKg: string;
  skeletalMuscleKg: string;
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
  if (record.skeletalMuscleKg !== null) {
    parts.push(`骨骼肌 ${record.skeletalMuscleKg} kg`);
  }
  return parts.join(" · ") || "體組成紀錄";
}

export function CustomerBodySection({
  records,
  today,
  birthYear,
  heightCm,
  onCreate,
}: {
  records: BodyCompositionRecord[];
  today: string;
  birthYear?: number;
  heightCm?: number;
  onCreate: (values: CustomerBodyFormValues) => void;
}) {
  const [showForm, setShowForm] = useState(records.length === 0);
  const [form, setForm] = useState<CustomerBodyFormValues>(() => emptyForm(today));

  const suggestedAge = useMemo(
    () => computeAgeFromBirthYear(birthYear, form.recordDate),
    [birthYear, form.recordDate],
  );

  const autoBmi = useMemo(
    () => computeBmi(parseNumber(form.weightKg), heightCm ?? null),
    [form.weightKg, heightCm],
  );

  useEffect(() => {
    if (!showForm || !birthYear || form.age.trim()) {
      return;
    }

    if (suggestedAge !== null) {
      setForm((current) => ({ ...current, age: String(suggestedAge) }));
    }
  }, [birthYear, form.age, showForm, suggestedAge]);

  useEffect(() => {
    if (autoBmi === null) {
      return;
    }

    setForm((current) => ({ ...current, bmi: String(autoBmi) }));
  }, [autoBmi]);

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
        const age = computeAgeFromBirthYear(birthYear, value);
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
          active={showForm}
          inactiveLabel={records.length === 0 ? "記錄量測" : "新增量測"}
          onClick={() => setShowForm((current) => !current)}
        />
      </div>

      {!heightCm ? (
        <p className="mt-3 rounded-2xl bg-[#fff7e6] px-4 py-3 text-[0.8125rem] text-[#d46b08]">
          尚未設定身高，BMI 無法自動計算。請在下方「基本資料」補上身高。
        </p>
      ) : null}

      {showForm ? (
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <CrmInput
            label="量測日期"
            onChange={(event) => updateField("recordDate", event.target.value)}
            required
            type="date"
            value={form.recordDate}
          />

          {birthYear && suggestedAge !== null ? (
            <p className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3 text-[0.8125rem] text-[#636366]">
              年齡：<span className="font-semibold text-[#1d1d1f]">{suggestedAge} 歲</span>
              <span className="text-[#86868b]">（依出生年自動計算）</span>
            </p>
          ) : (
            <CrmInput
              inputMode="numeric"
              label="年齡（選填）"
              onChange={(event) => updateField("age", event.target.value)}
              value={form.age}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
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
            </article>
          ))
        ) : (
          <p className="text-[0.9375rem] text-[#86868b]">尚無量測紀錄，點上方「記錄量測」開始。</p>
        )}
      </div>
    </CrmCard>
  );
}

export { parseNumber as parseCustomerBodyNumber };
