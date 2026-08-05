export function CrmCard({
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

export function CrmSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
      {children}
    </h2>
  );
}

export function CrmField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#f2f2f7] py-3.5 last:border-b-0">
      <dt className="text-[0.9375rem] text-[#636366]">{label}</dt>
      <dd className="max-w-[60%] text-right text-[0.9375rem] font-medium text-[#1d1d1f]">
        {value === null || value === undefined || value === "" ? "—" : value}
      </dd>
    </div>
  );
}

export function CrmButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-[var(--brand-primary)] text-white",
    secondary: "bg-[var(--brand-bg)] text-[#636366]",
    danger: "bg-[#fff1f0] text-[#cf1322]",
  };

  return (
    <button
      className={`w-full rounded-[1.25rem] px-4 py-4 text-[1rem] font-semibold transition-transform duration-200 active:scale-[0.98] disabled:opacity-60 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function CrmInput({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">{label}</span>
      <input
        className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] text-[#1d1d1f] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
        {...props}
      />
    </label>
  );
}

export function CrmTextarea({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">{label}</span>
      <textarea
        className="min-h-[6rem] w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] text-[#1d1d1f] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
        {...props}
      />
    </label>
  );
}

export function CrmSelect({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">{label}</span>
      <select
        className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] text-[#1d1d1f] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
