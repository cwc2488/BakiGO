"use client";

import { computeAgeFromCustomerProfile, computeBmi } from "@/lib/customers/body-metrics";
import {
  emptyCustomerBodyForm,
  parseCustomerBodyNumber,
  type CustomerBodyFormValues,
} from "@/lib/customers/customer-body-form";
import { useEffect, useMemo, useState } from "react";

export type CustomerBodyMeasurementFormProps = {
  today: string;
  birthYear?: number;
  birthDate?: string;
  heightCm?: number;
  submitLabel: string;
  onSubmit: (values: CustomerBodyFormValues) => void;
  disabled?: boolean;
  fieldClassName?: string;
  labelClassName?: string;
  inputClassName?: string;
  textareaClassName?: string;
  renderField?: (props: {
    label: string;
    children: React.ReactNode;
    required?: boolean;
  }) => React.ReactNode;
  renderSubmit?: (props: { disabled: boolean; label: string }) => React.ReactNode;
};

function DefaultField({
  label,
  children,
  labelClassName,
}: {
  label: string;
  children: React.ReactNode;
  labelClassName?: string;
}) {
  return (
    <label className="block">
      <span className={`mb-2 block text-sm font-medium ${labelClassName ?? "text-[#5f4f47]"}`}>
        {label}
      </span>
      {children}
    </label>
  );
}

function DefaultInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      className={
        className ??
        "w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base outline-none focus:border-[#f0a8b8]"
      }
    />
  );
}

function DefaultTextarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }) {
  return (
    <textarea
      {...props}
      className={
        className ??
        "min-h-[6rem] w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base outline-none focus:border-[#f0a8b8]"
      }
    />
  );
}

export function CustomerBodyMeasurementForm({
  today,
  birthYear,
  birthDate,
  heightCm,
  submitLabel,
  onSubmit,
  disabled = false,
  labelClassName,
  inputClassName,
  textareaClassName,
  renderField = (props) => <DefaultField {...props} labelClassName={labelClassName} />,
  renderSubmit,
}: CustomerBodyMeasurementFormProps) {
  const [form, setForm] = useState<CustomerBodyFormValues>(() => emptyCustomerBodyForm(today));

  const suggestedAge = useMemo(
    () => computeAgeFromCustomerProfile({ birthDate, birthYear }, form.recordDate),
    [birthDate, birthYear, form.recordDate],
  );

  const autoBmi = useMemo(
    () => computeBmi(parseCustomerBodyNumber(form.weightKg), heightCm ?? null),
    [form.weightKg, heightCm],
  );

  useEffect(() => {
    if (!(birthDate || birthYear) || form.age.trim()) {
      return;
    }
    if (suggestedAge !== null) {
      setForm((current) => ({ ...current, age: String(suggestedAge) }));
    }
  }, [birthDate, birthYear, form.age, suggestedAge]);

  useEffect(() => {
    if (autoBmi === null) {
      return;
    }
    setForm((current) => ({ ...current, bmi: String(autoBmi) }));
  }, [autoBmi]);

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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {!heightCm ? (
        <p className="rounded-[1.25rem] bg-[#fff7e6] px-4 py-3 text-sm text-[#d46b08]">
          尚未設定身高，BMI 無法自動計算。請回到 Step 1 補上身高。
        </p>
      ) : null}

      {renderField({
        label: "量測日期",
        children: (
          <DefaultInput
            className={inputClassName}
            onChange={(event) => updateField("recordDate", event.target.value)}
            required
            type="date"
            value={form.recordDate}
          />
        ),
      })}

      {birthDate || birthYear ? (
        suggestedAge !== null ? (
          <p className="rounded-[1.25rem] bg-[#f3ebe3] px-4 py-3 text-sm text-[#6f5f57]">
            年齡：<span className="font-semibold text-[#2f2622]">{suggestedAge} 歲</span>
            <span className="text-[#9a8b82]">（依顧客生日自動計算）</span>
          </p>
        ) : null
      ) : (
        renderField({
          label: "年齡（選填）",
          children: (
            <DefaultInput
              className={inputClassName}
              inputMode="numeric"
              onChange={(event) => updateField("age", event.target.value)}
              value={form.age}
            />
          ),
        })
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          ["weightKg", "體重 (kg)"],
          ["bodyFatPercent", "體脂率 (%)"],
          ["skeletalMuscleKg", "骨骼肌 (kg)"],
          ["bmi", autoBmi !== null ? "BMI（自動）" : "BMI"],
          ["visceralFatLevel", "內臟脂肪"],
          ["basalMetabolicRate", "基礎代謝"],
          ["bodyAge", "身體年齡"],
        ].map(([field, label]) => (
          <div key={field}>
            {renderField({
              label,
              children: (
                <DefaultInput
                  className={inputClassName}
                  inputMode={field === "bodyAge" ? "numeric" : "decimal"}
                  onChange={(event) => updateField(field as keyof CustomerBodyFormValues, event.target.value)}
                  value={form[field as keyof CustomerBodyFormValues]}
                />
              ),
            })}
          </div>
        ))}
      </div>

      {renderField({
        label: "備註（選填）",
        children: (
          <DefaultTextarea
            className={textareaClassName}
            onChange={(event) => updateField("note", event.target.value)}
            value={form.note}
          />
        ),
      })}

      {renderSubmit ? (
        renderSubmit({ disabled, label: submitLabel })
      ) : (
        <button
          type="submit"
          disabled={disabled}
          className="w-full rounded-[1.25rem] bg-[#2f2622] px-5 py-4 text-base font-semibold text-white disabled:opacity-50"
        >
          {submitLabel}
        </button>
      )}
    </form>
  );
}

export { parseCustomerBodyNumber };
