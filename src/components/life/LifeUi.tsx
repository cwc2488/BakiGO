export function formatLifeMoney(cents: number, signed = false) {
  const sign = cents < 0 ? "-" : signed && cents > 0 ? "+" : "";
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const frac = abs % 100;
  const base = yuan.toLocaleString("zh-TW");
  if (frac === 0) return `${sign}$${base}`;
  return `${sign}$${base}.${String(frac).padStart(2, "0")}`;
}

export function LifeHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--life-muted)]">
          Baki Life
        </p>
        <h1 className="mt-1 text-[1.65rem] font-semibold tracking-tight text-[var(--life-text)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--life-secondary)]">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </header>
  );
}

export function LifeStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  const color =
    tone === "positive"
      ? "text-[var(--life-positive)]"
      : tone === "negative"
        ? "text-[var(--life-negative)]"
        : "text-[var(--life-text)]";
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-[var(--life-muted)]">{label}</p>
      <p className={`mt-0.5 truncate text-xl font-semibold tracking-tight ${color}`}>{value}</p>
    </div>
  );
}

export function LifeProgress({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--life-border)]">
      <div
        className="h-full rounded-full bg-[var(--life-accent)] transition-[width] duration-300"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

export function LifeButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-[var(--life-accent)] text-white"
      : variant === "danger"
        ? "bg-[var(--life-negative)]/10 text-[var(--life-negative)]"
        : "bg-transparent text-[var(--life-secondary)]";
  return (
    <button type="button" className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function LifeInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-[var(--life-border)] bg-[var(--life-surface)] px-3 py-2.5 text-base text-[var(--life-text)] outline-none focus:border-[var(--life-accent)] ${props.className ?? ""}`}
    />
  );
}

export function LifeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-[var(--life-border)] bg-[var(--life-surface)] px-3 py-2.5 text-base text-[var(--life-text)] outline-none focus:border-[var(--life-accent)] ${props.className ?? ""}`}
    />
  );
}

export function LifeSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--life-secondary)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
