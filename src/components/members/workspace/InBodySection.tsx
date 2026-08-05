"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import type { InBodyRecord } from "@/types/member-workspace";
import { useState } from "react";
import { CrmButton, CrmCard, CrmInput, CrmSectionTitle, CrmTextarea } from "../ui";

export interface InBodyFormValues {
  recordDate: string;
  heightCm: string;
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

function emptyForm(today: string): InBodyFormValues {
  return {
    recordDate: today,
    heightCm: "",
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

function formatRecordSummary(record: InBodyRecord): string {
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

export function InBodySection({
  records,
  today,
  onCreate,
}: {
  records: InBodyRecord[];
  today: string;
  onCreate: (values: InBodyFormValues) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<InBodyFormValues>(() => emptyForm(today));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onCreate(form);
    setForm(emptyForm(today));
    setShowForm(false);
  };

  const updateField = (field: keyof InBodyFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
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
          {showForm ? "取消" : "新增紀錄"}
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
              label="身高 (cm)"
              inputMode="decimal"
              value={form.heightCm}
              onChange={(event) => updateField("heightCm", event.target.value)}
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
          <CrmButton type="submit">儲存體組成</CrmButton>
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
                {record.heightCm !== null ? (
                  <>
                    <dt>身高</dt>
                    <dd className="text-right text-[#1d1d1f]">{record.heightCm} cm</dd>
                  </>
                ) : null}
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
          <p className="text-[0.9375rem] text-[#86868b]">尚無體組成紀錄</p>
        )}
      </div>
    </CrmCard>
  );
}

export { parseNumber as parseInBodyNumber };
