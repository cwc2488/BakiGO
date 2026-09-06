"use client";

import { LifeDataProvider } from "@/components/life/LifeDataProvider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const NAV = [
  { href: "/life", label: "首頁", icon: "⌂" },
  { href: "/life/quick", label: "記帳", icon: "✎" },
  { href: "/life/goals", label: "目標", icon: "◎" },
  { href: "/life/analytics", label: "統計", icon: "▦" },
  { href: "/life/assets", label: "資產", icon: "◈" },
] as const;

function isActive(pathname: string, href: string, pendingHref: string | null) {
  const current = pendingHref ?? pathname;
  if (href === "/life") return current === "/life";
  return current === href || current.startsWith(`${href}/`);
}

function LifeBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    for (const item of NAV) router.prefetch(item.href);
    router.prefetch("/life/ledger");
  }, [router]);

  return (
    <nav className="life-bottom-nav" aria-label="Baki Life">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href, pendingHref);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                onClick={(e) => {
                  if (item.href === pathname) return;
                  setPendingHref(item.href);
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                    e.preventDefault();
                    startTransition(() => {
                      router.push(item.href);
                    });
                  }
                }}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 pb-2 pt-1.5 text-center transition-colors ${
                  active
                    ? "text-[var(--brand-primary-dark)]"
                    : "text-[var(--life-muted)]"
                }`}
              >
                <span
                  className={`h-0.5 w-6 rounded-full transition-colors ${
                    active ? "bg-[var(--brand-primary)]" : "bg-transparent"
                  }`}
                />
                <span className="text-base leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span className="text-[0.6875rem] font-semibold leading-tight tracking-wide">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function useLifeViewportPaint() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const theme = document.querySelector('meta[name="theme-color"]');
    const prevTheme = theme?.getAttribute("content") ?? null;

    html.style.backgroundColor = "#f5faf6";
    body.style.backgroundColor = "#f5faf6";
    if (theme) theme.setAttribute("content", "#f5faf6");

    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
      if (theme && prevTheme != null) theme.setAttribute("content", prevTheme);
    };
  }, []);
}

export function LifeShell({ children }: { children: React.ReactNode }) {
  useLifeViewportPaint();

  return (
    <LifeDataProvider>
      <div className="life-root">
        <div className="mx-auto min-h-dvh max-w-lg pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </div>
        <LifeBottomNav />
      </div>
    </LifeDataProvider>
  );
}
