import Link from "next/link";
import type { ReactNode } from "react";

type PageShellVariant = "gradient" | "plain";

const BACKGROUNDS: Record<PageShellVariant, string> = {
  gradient: "bg-[linear-gradient(180deg,#f0faf3_0%,#f5faf6_48%,#e8f8ee_100%)]",
  plain: "bg-[var(--brand-bg)]",
};

export function PageShell({
  children,
  title,
  subtitle,
  backHref = "/",
  backLabel = "返回首頁",
  showBack = true,
  variant = "gradient",
  containerClassName = "home-container",
  headerExtra,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  showBack?: boolean;
  variant?: PageShellVariant;
  containerClassName?: string;
  headerExtra?: ReactNode;
}) {
  return (
    <div className={`min-h-full ${BACKGROUNDS[variant]}`}>
      <main className={`${containerClassName} flex flex-col gap-5 pb-24 pt-10 sm:pt-12`}>
        <header className="home-section space-y-2">
          {showBack ? (
            <Link
              className="inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)] transition-opacity active:opacity-70"
              href={backHref}
            >
              ← {backLabel}
            </Link>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[2rem] font-semibold tracking-tight text-[#1d1d1f] sm:text-[2.125rem]">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#86868b]">{subtitle}</p>
              ) : null}
            </div>
            {headerExtra ? <div className="shrink-0">{headerExtra}</div> : null}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
