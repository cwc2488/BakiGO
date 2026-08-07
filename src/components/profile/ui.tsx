import type { ReactNode } from "react";
import { AppIcon, type AppIconName } from "@/components/ui/AppIcon";
import { BrandCard, ProgressBar, SectionLabel } from "@/components/ui/brand-ui";

export function ProfileCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <BrandCard className={className} variant="bordered">
      {children}
    </BrandCard>
  );
}

export { ProgressBar, SectionLabel as ProfileSectionTitle };

export function ProfileHeroTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[var(--brand-text)] sm:text-[2.25rem]">
      {children}
    </h1>
  );
}

export function StatRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#f2f2f7] py-4 last:border-b-0">
      <dt className="text-[1rem] text-[var(--brand-text-secondary)]">{label}</dt>
      <dd className="text-[1.0625rem] font-semibold text-[var(--brand-text)]">
        {value === null || value === undefined || value === "" ? "—" : value}
      </dd>
    </div>
  );
}

export function MetricTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4 sm:px-5 sm:py-5">
      <p className="text-[0.8125rem] font-medium text-[var(--brand-text-muted)]">{label}</p>
      <p className="mt-2 text-[1.5rem] font-semibold leading-none tracking-tight text-[var(--brand-text)] sm:text-[1.625rem]">
        {value === null ? "—" : value}
        {value !== null && unit ? (
          <span className="ml-1 text-[0.9375rem] font-medium text-[var(--brand-text-muted)]">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}

export function EmptyBlock({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: AppIconName;
}) {
  return (
    <div className="rounded-2xl bg-[var(--brand-bg)] px-5 py-6 text-center">
      {icon ? (
        <div className="mb-2 flex justify-center">
          <AppIcon name={icon} size={32} />
        </div>
      ) : null}
      <p className="text-[1rem] font-semibold text-[var(--brand-text)]">{title}</p>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--brand-text-muted)]">{description}</p>
    </div>
  );
}
