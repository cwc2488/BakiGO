"use client";

import { useState } from "react";

export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function commitDraft(raw: string) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      setEditing(false);
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    onChange(clamped);
    setDraft(String(clamped));
    setEditing(false);
  }

  return (
    <div className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4 shadow-[0_1px_2px_rgba(29,29,31,0.04)]">
      <p className="text-[0.875rem] font-semibold text-[var(--brand-text)]">{label}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="減少"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--brand-border)] text-[1.25rem] font-semibold text-[var(--brand-text)] active:bg-[var(--brand-primary-muted)]"
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        {editing ? (
          <input
            autoFocus
            inputMode="numeric"
            className="w-24 rounded-xl border border-[var(--brand-border)] bg-white px-2 py-2 text-center text-[1.75rem] font-semibold tabular-nums text-[var(--brand-text)] outline-none focus:border-[var(--brand-primary)]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitDraft(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft(draft);
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-[5rem] text-center text-[1.75rem] font-semibold tabular-nums text-[var(--brand-text)]"
            onClick={() => {
              setDraft(String(value));
              setEditing(true);
            }}
          >
            {value}
          </button>
        )}
        <button
          type="button"
          aria-label="增加"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--brand-border)] text-[1.25rem] font-semibold text-[var(--brand-text)] active:bg-[var(--brand-primary-muted)]"
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}
