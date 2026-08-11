import Link from "next/link";
import type { ReactNode } from "react";

export function HomeFeatureEntryCard({
  href,
  eyebrow,
  title,
  description,
  cta,
  icon,
  eyebrowClassName,
  className,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  icon: ReactNode;
  eyebrowClassName?: string;
  className: string;
}) {
  return (
    <Link
      className={`block rounded-[1.75rem] px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-transform duration-200 active:scale-[0.99] ${className}`}
      href={href}
    >
      <div className="flex items-start gap-3.5">
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[0.6875rem] font-semibold uppercase tracking-[0.1em] ${eyebrowClassName ?? "text-[#86868b]"}`}
          >
            {eyebrow}
          </p>
          <h2 className="mt-1 text-[1.0625rem] font-semibold text-[#1d1d1f]">{title}</h2>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#86868b]">{description}</p>
          <p className="mt-3 text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]">
            {cta}
          </p>
        </div>
      </div>
    </Link>
  );
}
