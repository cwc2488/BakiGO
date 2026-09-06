"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/life", label: "首頁", icon: "⌂" },
  { href: "/life/ledger", label: "記帳", icon: "✎" },
  { href: "/life/goals", label: "目標", icon: "◎" },
  { href: "/life/analytics", label: "統計", icon: "▦" },
  { href: "/life/assets", label: "資產", icon: "◈" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/life") return pathname === "/life";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function LifeBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="life-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-[var(--life-border)] bg-[var(--life-surface)]/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] tracking-wide ${
                  active
                    ? "text-[var(--life-accent)]"
                    : "text-[var(--life-muted)]"
                }`}
              >
                <span className="text-base leading-none opacity-80">{item.icon}</span>
                <span className={active ? "font-medium" : ""}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function LifeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isQuick = pathname === "/life/quick" || pathname.startsWith("/life/quick/");
  return (
    <div className="life-root min-h-dvh bg-[var(--life-bg)] text-[var(--life-text)]">
      <div
        className={
          isQuick
            ? "mx-auto min-h-dvh max-w-lg"
            : "mx-auto min-h-dvh max-w-lg pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]"
        }
      >
        {children}
      </div>
      {isQuick ? null : <LifeBottomNav />}
    </div>
  );
}
