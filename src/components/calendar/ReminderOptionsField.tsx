"use client";

import {
  CALENDAR_REMINDER_OPTIONS,
  formatReminderSummary,
} from "@/lib/calendar/calendar-reminder-options";

export function ReminderOptionsField({
  value,
  onChange,
  disabled = false,
  helperText,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  function toggle(minutes: number) {
    if (disabled) {
      return;
    }

    if (value.includes(minutes)) {
      onChange(value.filter((item) => item !== minutes));
      return;
    }

    onChange([...value, minutes].sort((left, right) => left - right));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.875rem] font-medium text-[#636366]">提醒通知</span>
        <span className="text-[0.75rem] text-[#86868b]">{formatReminderSummary(value)}</span>
      </div>
      {helperText ? (
        <p className="text-[0.8125rem] leading-relaxed text-[#86868b]">{helperText}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {CALENDAR_REMINDER_OPTIONS.map((option) => {
          const active = value.includes(option.minutes);
          return (
            <button
              key={option.minutes}
              className={`rounded-full px-3 py-2 text-[0.8125rem] font-semibold transition-colors ${
                active
                  ? "bg-[var(--cal-primary)] text-white"
                  : "bg-[var(--cal-primary-muted)] text-[#636366]"
              } ${disabled ? "opacity-60" : ""}`}
              disabled={disabled}
              onClick={() => toggle(option.minutes)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
