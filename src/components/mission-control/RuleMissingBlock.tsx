import {
  RULE_MISSING_DESCRIPTION,
  RULE_MISSING_LABEL,
} from "@/types/rule-engine";

export function RuleMissingBlock({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-[#d2d2d7] bg-[#fafafa] px-4 py-5 text-center ${className}`}
    >
      <p className="text-[1rem] font-semibold text-[#1d1d1f]">{RULE_MISSING_LABEL}</p>
      <p className="mt-1 text-[0.875rem] text-[#86868b]">{RULE_MISSING_DESCRIPTION}</p>
    </div>
  );
}

export function RuleMissingBanner({
  entryCount,
}: {
  entryCount: number;
}) {
  if (entryCount <= 0) {
    return null;
  }

  return (
    <section className="rounded-[1.75rem] border border-[#ffd60a]/40 bg-[#fff9e6] px-5 py-4">
      <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{RULE_MISSING_LABEL}</p>
      <p className="mt-1 text-[0.875rem] leading-relaxed text-[#636366]">
        {RULE_MISSING_DESCRIPTION}
      </p>
      <p className="mt-2 text-[0.8125rem] font-medium text-[#86868b]">
        待定義規則：{entryCount} 項
      </p>
    </section>
  );
}
