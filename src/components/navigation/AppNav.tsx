"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MemberAvatar } from "@/components/members/MemberAvatar";
import { NAV_ICONS, IconGoals, QUICK_LINK_ICONS, type NavHref, type QuickLinkHref } from "@/components/ui/BrandIcons";
import { getMemberAvatarUrl, getMemberDisplayName } from "@/lib/mission-control/format";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { SIDE_NAV_EXTRA_LINKS } from "@/lib/ui/work-hub-links";
import { useMemo } from "react";

const NAV_ITEMS = [
  { href: "/", label: "首頁", shortLabel: "首頁" },
  { href: "/daily-action", label: "今日", shortLabel: "今日" },
  { href: "/calendar", label: "行事曆", shortLabel: "行事曆" },
  { href: "/profile", label: "我的", shortLabel: "我的" },
] as const satisfies ReadonlyArray<{ href: NavHref; label: string; shortLabel: string }>;

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
  const Icon = NAV_ICONS[item.href];

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
        <Icon className="shrink-0" size={20} />
        <span className="text-[0.875rem] font-semibold">{item.label}</span>
      </Link>
    );
  }

  return (
    <Link
      className={`flex flex-col items-center gap-1 px-1 pb-2 pt-1.5 text-center transition-colors ${
        active ? "text-[var(--brand-primary-dark)]" : "text-[var(--brand-text-muted)] hover:text-[var(--brand-text)]"
      }`}
      href={item.href}
    >
      <span
        className={`h-0.5 w-7 rounded-full transition-colors ${
          active ? "bg-[var(--brand-primary)]" : "bg-transparent"
        }`}
      />
      <Icon size={22} />
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

        <div className="my-2 border-t border-[var(--brand-border)]" />

        <p className="mb-1 hidden px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[#86868b] lg:block">
          更多
        </p>
        {SIDE_NAV_EXTRA_LINKS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = QUICK_LINK_ICONS[item.href as QuickLinkHref] ?? IconGoals;
          return (
            <Link
              key={item.href}
              className={`flex w-full items-center justify-center gap-3 rounded-xl px-3 py-2.5 transition-colors lg:justify-start ${
                active
                  ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
                  : "text-[#636366] hover:bg-[var(--brand-bg)] hover:text-[#1d1d1f]"
              }`}
              href={item.href}
              title={item.title}
            >
              <Icon size={20} />
              <span className="hidden text-[0.875rem] font-semibold lg:inline">{item.title}</span>
            </Link>
          );
        })}
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
