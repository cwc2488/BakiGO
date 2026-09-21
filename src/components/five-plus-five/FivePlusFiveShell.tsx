"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TabRootShell } from "@/components/ui/TabRootShell";

const TABS = [
  { href: "/5plus5", label: "我的回報", exact: true },
  { href: "/5plus5/organization", label: "我的組織", exact: false },
  { href: "/5plus5/guide", label: "邀約5步驟", exact: false },
] as const;

export function FivePlusFiveShell({
  children,
  title = "5＋5 行動",
  subtitle,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const pathname = usePathname();

  return (
    <TabRootShell
      header={
        <header className="space-y-4">
          <div>
            <p className="text-[0.75rem] font-semibold tracking-[0.06em] text-[var(--brand-text-muted)]">
              Baki Go
            </p>
            <h1 className="mt-1 text-[1.625rem] font-semibold tracking-tight text-[var(--brand-text)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-[0.875rem] text-[var(--brand-text-secondary)]">{subtitle}</p>
            ) : null}
          </div>
          <nav
            aria-label="5＋5 頁籤"
            className="flex gap-1 rounded-[1rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-1"
          >
            {TABS.map((tab) => {
              const active = tab.exact
                ? pathname === tab.href
                : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex-1 rounded-[0.75rem] px-2 py-2.5 text-center text-[0.8125rem] font-semibold transition-colors ${
                    active
                      ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
                      : "text-[var(--brand-text-secondary)]"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </header>
      }
    >
      {children}
    </TabRootShell>
  );
}
