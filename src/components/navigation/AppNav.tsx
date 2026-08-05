"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { APP_EMOJI } from "@/lib/ui/app-emojis";

const NAV_ITEMS = [
  { href: "/", label: "首頁", shortLabel: "首頁", emoji: APP_EMOJI.nav.home },
  { href: "/leaderboard", label: "排行榜", shortLabel: "排行", emoji: APP_EMOJI.hub.leaderboard },
  { href: "/daily-action", label: "今日", shortLabel: "今日", emoji: APP_EMOJI.nav.daily },
  { href: "/calendar", label: "行事曆", shortLabel: "行事曆", emoji: APP_EMOJI.nav.calendar },
  { href: "/retail-pipeline", label: "名單流程", shortLabel: "名單", emoji: APP_EMOJI.nav.pipeline },
  { href: "/retail-house", label: "零售屋", shortLabel: "零售屋", emoji: APP_EMOJI.nav.retailHouse },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主要功能"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--brand-border)] bg-[var(--brand-surface)]/95 backdrop-blur-md"
    >
      <div className="mx-auto grid max-w-lg grid-cols-6">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              className={`flex flex-col items-center gap-0.5 px-1 py-2.5 text-center transition-colors ${
                active
                  ? "text-[var(--brand-primary-dark)]"
                  : "text-[#86868b] hover:text-[#1d1d1f]"
              }`}
              href={item.href}
            >
              <span className="text-[1.125rem] leading-none" aria-hidden>
                {item.emoji}
              </span>
              <span className="text-[0.6875rem] font-semibold leading-tight sm:text-[0.75rem]">
                {item.shortLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
