import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon, routeIcon, type AppIconName } from "./AppIcon";
import { ROUTE_ICON_COMPONENTS, type QuickLinkHref } from "./BrandIcons";

export const PAGE_GRADIENT_CLASS =
  "bg-[linear-gradient(180deg,#f7faf8_0%,#f5faf6_55%,#f3f8f4_100%)]";

export function BrandCard({
  children,
  className = "",
  variant = "shadow",
}: {
  children: ReactNode;
  className?: string;
  variant?: "shadow" | "bordered";
}) {
  const surface =
    variant === "shadow"
      ? "border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] shadow-[0_1px_2px_rgba(29,29,31,0.04)]"
      : "border border-[var(--brand-border)]/80 bg-[var(--brand-surface)]";

  return (
    <section className={`rounded-[1.25rem] p-5 sm:p-6 ${surface} ${className}`}>
      {children}
    </section>
  );
}

export function SectionLabel({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: AppIconName;
}) {
  return (
    <h2 className="flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-muted)]">
      {icon ? <AppIcon className="normal-case text-[var(--brand-primary)]" name={icon} size={14} /> : null}
      {children}
    </h2>
  );
}

export function ProgressBar({
  percent,
  color = "#77b539",
  height = "h-2",
}: {
  percent: number | null;
  color?: string;
  height?: string;
}) {
  if (percent === null) {
    return null;
  }

  return (
    <div className={`${height} overflow-hidden rounded-full bg-[var(--brand-border)]`}>
      <div
        className="h-full rounded-full transition-all duration-250 ease-out"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

const PRIMARY_BUTTON_CLASS =
  "rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[0.9375rem] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60";

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${PRIMARY_BUTTON_CLASS} ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}

export function PrimarySubmitButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`w-full ${PRIMARY_BUTTON_CLASS} ${className}`} type="submit" {...props}>
      {children}
    </button>
  );
}

export function QuickLinkGrid({
  links,
}: {
  links: readonly { href: string; label: string; emoji?: string }[];
  emojiByHref?: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {links.map((link) => {
        const href = link.href as QuickLinkHref;
        const Icon = ROUTE_ICON_COMPONENTS[href] ?? ROUTE_ICON_COMPONENTS["/events"];
        return (
          <Link
            key={link.href}
            className="flex min-h-[4.25rem] items-center gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 shadow-[0_4px_20px_rgba(36,138,61,0.05)] transition-colors active:bg-[var(--brand-primary-muted)] hover:border-[#d1d1d6]"
            href={link.href}
          >
            <Icon className="shrink-0 text-[var(--brand-primary)]" size={24} />
            <span className="text-[0.9375rem] font-semibold text-[var(--brand-primary-dark)]">{link.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
