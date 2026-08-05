"use client";

import { TAIWAN_REGION_SUGGESTIONS } from "@/lib/ui/taiwan-regions";

export function RegionField({
  value,
  onChange,
  id = "region",
  className = "w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-[0.875rem] outline-none focus:border-[var(--brand-primary)]",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}) {
  const listId = `${id}-suggestions`;

  return (
    <>
      <input
        className={className}
        id={id}
        list={listId}
        onChange={(event) => onChange(event.target.value)}
        placeholder="例如 台北、台中"
        value={value}
      />
      <datalist id={listId}>
        {TAIWAN_REGION_SUGGESTIONS.map((region) => (
          <option key={region} value={region} />
        ))}
      </datalist>
    </>
  );
}
