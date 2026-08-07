"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MemberAvatar } from "@/components/members/MemberAvatar";
import { getMemberAvatarUrl, getMemberDisplayName } from "@/lib/mission-control/format";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import { useMemo } from "react";

const NAV_ITEMS = [
  { href: "/", label: "首頁", shortLabel: "首頁", emoji: APP_EMOJI.nav.home },
  { href: "/daily-action", label: "今日", shortLabel: "今日", emoji: APP_EMOJI.nav.daily },
  { href: "/calendar", label: "行事曆", shortLabel: "行事曆", emoji: APP_EMOJI.nav.calendar },
  { href: "/profile", label: "我的", shortLabel: "我的", emoji: APP_EMOJI.page.profile },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  layout,
}: {
  item: (typeof NAV_ITEMS)[number];
  pathname: string;
  layout: "bottom" | "side";
}) {
  const active = isActive(pathname, item.href);

  if (layout === "side") {
    return (
      <Link
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
          active
            ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
            : "text-[#636366] hover:bg-[var(--brand-bg)] hover:text-[#1d1d1f]"
        }`}
        href={item.href}
      >
        <span className="text-[1.125rem] leading-none" aria-hidden>
          {item.emoji}
        </span>
        <span className="text-[0.875rem] font-semibold">{item.label}</span>
      </Link>
    );
  }

  return (
    <Link
      className={`flex flex-col items-center gap-0.5 px-1 py-2.5 text-center transition-colors ${
        active ? "text-[var(--brand-primary-dark)]" : "text-[#86868b] hover:text-[#1d1d1f]"
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
}

export function AppSideNav() {
  const pathname = usePathname();
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const displayName = getMemberDisplayName(undefined, storage);
  const avatarUrl = getMemberAvatarUrl(undefined, storage);

  return (
    <aside className="hidden md:flex md:w-[5.75rem] md:shrink-0 md:flex-col md:border-r md:border-[var(--brand-border)] md:bg-[var(--brand-surface)] lg:w-[15rem]">
      <div className="flex flex-col items-center gap-3 border-b border-[var(--brand-border)] px-3 py-5 lg:items-stretch lg:px-4">
        <Link className="group flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:gap-3" href="/profile">
          <MemberAvatar avatarUrl={avatarUrl} name={displayName} size="md" />
          <div className="hidden min-w-0 text-center lg:block lg:text-left">
            <p className="truncate text-[0.875rem] font-semibold text-[#1d1d1f] group-hover:text-[var(--brand-primary-dark)]">
              {displayName}
            </p>
            <p className="text-[0.75rem] text-[#86868b]">個人頁</p>
          </div>
        </Link>
      </div>

      <nav aria-label="主要功能" className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} layout="side" pathname={pathname} />
        ))}
      </nav>
    </aside>
  );
}

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主要功能"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-[var(--brand-border)] bg-[var(--brand-surface)]/98 backdrop-blur-md supports-[padding:max(0px)]:pb-[max(0px,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} layout="bottom" pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

/** @deprecated Use AppBottomNav or AppSideNav */
export function AppNav() {
  return <AppBottomNav />;
}
