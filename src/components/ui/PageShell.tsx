import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon, type AppIconName } from "./AppIcon";
import { PAGE_GRADIENT_CLASS } from "./brand-ui";

type PageShellVariant = "gradient" | "plain";

const BACKGROUNDS: Record<PageShellVariant, string> = {
  gradient: PAGE_GRADIENT_CLASS,
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
  titleIcon,
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
  titleIcon?: AppIconName;
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
              <h1 className="flex items-center gap-2.5 text-[2rem] font-semibold tracking-tight text-[var(--brand-text)] sm:text-[2.125rem]">
                {titleIcon ? <AppIcon className="shrink-0" name={titleIcon} size={28} /> : null}
                <span>{title}</span>
              </h1>
              {subtitle ? (
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--brand-text-muted)]">{subtitle}</p>
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
