"use client";

import { useEffect, useState } from "react";
import { MobileFormModal } from "@/components/ui/MobileFormModal";
import {
  MEMO_REMINDER_TYPES,
  MEMO_WEEKDAY_LABELS,
  type Memo,
  type MemoReminderType,
  type MemoUpsertInput,
  type MemoWeekday,
} from "@/lib/memos/types";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly MemoWeekday[];

const REMINDER_OPTIONS: { value: MemoReminderType; label: string }[] = [
  { value: MEMO_REMINDER_TYPES.NONE, label: "不提醒" },
  { value: MEMO_REMINDER_TYPES.DAILY, label: "每天" },
  { value: MEMO_REMINDER_TYPES.WEEKLY, label: "每週" },
  { value: MEMO_REMINDER_TYPES.SPECIFIC_DATE, label: "指定日期" },
];

type FormState = {
  title: string;
  content: string;
  reminderType: MemoReminderType;
  reminderTime: string;
  reminderWeekday: MemoWeekday;
  reminderDate: string;
};

function toFormState(memo?: Memo | null): FormState {
  return {
    title: memo?.title ?? "",
    content: memo?.content ?? "",
    reminderType: memo?.reminderType ?? MEMO_REMINDER_TYPES.NONE,
    reminderTime: memo?.reminderTime ?? "09:00",
    reminderWeekday: memo?.reminderWeekday ?? 1,
    reminderDate: memo?.reminderDate ?? "",
  };
}

function toUpsert(state: FormState): MemoUpsertInput {
  return {
    title: state.title.trim(),
    content: state.content.trim() ? state.content.trim() : null,
    reminderType: state.reminderType,
    reminderTime:
      state.reminderType === MEMO_REMINDER_TYPES.NONE ? null : state.reminderTime,
    reminderWeekday:
      state.reminderType === MEMO_REMINDER_TYPES.WEEKLY ? state.reminderWeekday : null,
    reminderDate:
      state.reminderType === MEMO_REMINDER_TYPES.SPECIFIC_DATE ? state.reminderDate : null,
  };
}

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2.5 text-[0.9375rem] text-[var(--brand-text)] outline-none focus:border-[var(--brand-primary)]";

export function MemoFormModal({
  open,
  title,
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: Memo | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (input: MemoUpsertInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(toFormState(initial));
    setError(null);
  }, [open, initial]);

  const submit = async () => {
    if (!form.title.trim()) {
      setError("請填寫標題");
      return;
    }
    setError(null);
    try {
      await onSubmit(toUpsert(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    }
  };

  return (
    <MobileFormModal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={saving}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-[0.9375rem] font-semibold text-white disabled:opacity-60"
          onClick={() => void submit()}
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">標題</span>
          <input
            className={fieldClass}
            value={form.title}
            maxLength={120}
            placeholder="例如：聯絡王小姐"
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
        </label>

        <label className="block">
          <span className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">
            內容（可選）
          </span>
          <textarea
            className={`${fieldClass} min-h-[5.5rem] resize-none`}
            value={form.content}
            maxLength={4000}
            placeholder="補充說明"
            onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
          />
        </label>

        <label className="block">
          <span className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">提醒</span>
          <select
            className={fieldClass}
            value={form.reminderType}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                reminderType: event.target.value as MemoReminderType,
              }))
            }
          >
            {REMINDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {form.reminderType === MEMO_REMINDER_TYPES.DAILY ? (
          <label className="block">
            <span className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">
              每天
            </span>
            <input
              type="time"
              className={fieldClass}
              value={form.reminderTime}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, reminderTime: event.target.value }))
              }
            />
          </label>
        ) : null}

        {form.reminderType === MEMO_REMINDER_TYPES.WEEKLY ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">
                星期幾
              </span>
              <select
                className={fieldClass}
                value={form.reminderWeekday}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    reminderWeekday: Number(event.target.value) as MemoWeekday,
                  }))
                }
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {MEMO_WEEKDAY_LABELS[day]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">
                時間
              </span>
              <input
                type="time"
                className={fieldClass}
                value={form.reminderTime}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reminderTime: event.target.value }))
                }
              />
            </label>
          </div>
        ) : null}

        {form.reminderType === MEMO_REMINDER_TYPES.SPECIFIC_DATE ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">
                日期
              </span>
              <input
                type="date"
                className={fieldClass}
                value={form.reminderDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reminderDate: event.target.value }))
                }
              />
            </label>
            <label className="block">
              <span className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]">
                時間
              </span>
              <input
                type="time"
                className={fieldClass}
                value={form.reminderTime}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reminderTime: event.target.value }))
                }
              />
            </label>
          </div>
        ) : null}

        {error ? <p className="text-[0.8125rem] text-[#b42318]">{error}</p> : null}
      </div>
    </MobileFormModal>
  );
}
