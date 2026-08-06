export function ProfileCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 sm:p-7 ${className}`}
    >
      {children}
    </section>
  );
}

export function ProfileSectionTitle({
  children,
  emoji,
}: {
  children: React.ReactNode;
  emoji?: string;
}) {
  return (
    <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
      {emoji ? <span className="mr-1.5 normal-case">{emoji}</span> : null}
      {children}
    </h2>
  );
}

export function ProfileHeroTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[#1d1d1f] sm:text-[2.25rem]">
      {children}
    </h1>
  );
}

export function StatRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#f2f2f7] py-4 last:border-b-0">
      <dt className="text-[1rem] text-[#636366]">{label}</dt>
      <dd className="text-[1.0625rem] font-semibold text-[#1d1d1f]">
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
      <p className="text-[0.8125rem] font-medium text-[#86868b]">{label}</p>
      <p className="mt-2 text-[1.5rem] font-semibold leading-none tracking-tight text-[#1d1d1f] sm:text-[1.625rem]">
        {value === null ? "—" : value}
        {value !== null && unit ? (
          <span className="ml-1 text-[0.9375rem] font-medium text-[#86868b]">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}

export function EmptyBlock({
  title,
  description,
  emoji,
}: {
  title: string;
  description: string;
  emoji?: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--brand-bg)] px-5 py-6 text-center">
      {emoji ? <p className="text-[1.75rem] leading-none">{emoji}</p> : null}
      <p className={`text-[1rem] font-semibold text-[#1d1d1f] ${emoji ? "mt-2" : ""}`}>{title}</p>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[#86868b]">{description}</p>
    </div>
  );
}

export function ProgressBar({
  percent,
  color = "#77b539",
}: {
  percent: number | null;
  color?: string;
}) {
  if (percent === null) {
    return null;
  }

  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--brand-border)]">
      <div
        className="h-full rounded-full transition-all duration-250 ease-out"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}
