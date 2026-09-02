"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { MemberAvatar } from "@/components/members/MemberAvatar";
import { AppIcon, type AppIconName } from "@/components/ui/AppIcon";
import { NAV_ICONS, ROUTE_ICON_COMPONENTS, type NavHref, type QuickLinkHref } from "@/components/ui/BrandIcons";
import { getMemberAvatarUrl, getMemberDisplayName } from "@/lib/mission-control/format";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { SIDE_NAV_EXTRA_LINKS } from "@/lib/ui/work-hub-links";
import { QuizPartnerNavBadge } from "@/components/quiz/QuizPartnerNavBadge";

/** UX-1：我的｜顧客｜行事曆 */
const NAV_ITEMS = [
  { href: "/", label: "我的", shortLabel: "我的" },
  { href: "/customers", label: "顧客", shortLabel: "顧客" },
  { href: "/calendar", label: "行事曆", shortLabel: "行事曆" },
] as const satisfies ReadonlyArray<{ href: NavHref; label: string; shortLabel: string }>;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return (
      pathname === "/" ||
      pathname === "/profile" ||
      pathname === "/daily-action" ||
      pathname.startsWith("/goals") ||
      pathname.startsWith("/president-road") ||
      pathname.startsWith("/organization") ||
      pathname.startsWith("/members") ||
      pathname.startsWith("/retail-house") ||
      pathname.startsWith("/leaderboard") ||
      pathname.startsWith("/learning") ||
      pathname.startsWith("/promotions") ||
      pathname.startsWith("/events") ||
      pathname.startsWith("/pre-meeting-graphic") ||
      pathname.startsWith("/recognition") ||
      pathname.startsWith("/admin")
    );
  }
  if (href === "/customers") {
    return (
      pathname === "/customers" ||
      pathname.startsWith("/customers/") ||
      pathname.startsWith("/coaching") ||
      pathname.startsWith("/retail-pipeline") ||
      pathname.startsWith("/quiz") ||
      pathname.startsWith("/consultation") ||
      pathname.startsWith("/radar")
    );
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
        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
          active
            ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
            : "text-[#636366] hover:bg-[var(--brand-bg)] hover:text-[#1d1d1f]"
        }`}
        href={item.href}
      >
        <Icon className="shrink-0" size={26} />
        <span className="text-[0.9375rem] font-semibold">{item.label}</span>
      </Link>
    );
  }

  return (
    <Link
      className={`flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 pb-2 pt-1.5 text-center transition-colors ${
        active ? "text-[var(--brand-primary-dark)]" : "text-[var(--brand-text-muted)] hover:text-[var(--brand-text)]"
      }`}
      href={item.href}
    >
      <span
        className={`h-0.5 w-6 rounded-full transition-colors ${
          active ? "bg-[var(--brand-primary)]" : "bg-transparent"
        }`}
      />
      <Icon size={24} />
      <span className="text-[0.6875rem] font-semibold leading-tight tracking-wide">{item.shortLabel}</span>
    </Link>
  );
}

function SideExtraLink({
  href,
  title,
  icon,
  pathname,
  waitingBadge,
}: {
  href: string;
  title: string;
  icon: AppIconName;
  pathname: string;
  waitingBadge?: boolean;
}) {
  const active = isActive(pathname, href) || pathname === href || pathname.startsWith(`${href}/`);
  const RouteIcon = ROUTE_ICON_COMPONENTS[href as QuickLinkHref];

  return (
    <Link
      className={`flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-3 py-2.5 transition-colors lg:justify-start ${
        active
          ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
          : "text-[#636366] hover:bg-[var(--brand-bg)] hover:text-[#1d1d1f]"
      }`}
      href={href}
      title={title}
    >
      <span className="relative">
        {RouteIcon ? <RouteIcon size={24} /> : <AppIcon name={icon} size={24} />}
        {waitingBadge ? (
          <span className="absolute -right-2 -top-2 lg:hidden">
            <QuizPartnerNavBadge />
          </span>
        ) : null}
      </span>
      <span className="hidden min-w-0 items-center gap-2 lg:inline-flex">
        <span className="text-[0.875rem] font-semibold">{title}</span>
        {waitingBadge ? <QuizPartnerNavBadge /> : null}
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
    <aside className="fixed inset-y-0 left-0 z-[90] hidden w-[5.75rem] shrink-0 flex-col border-r border-[var(--brand-border)] bg-[var(--brand-surface)] md:flex lg:w-[15rem]">
      <div className="flex flex-col items-center gap-3 border-b border-[var(--brand-border)] px-3 py-5 lg:items-stretch lg:px-4">
        <Link className="group flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:gap-3" href="/">
          <MemberAvatar avatarUrl={avatarUrl} name={displayName} size="md" />
          <div className="hidden min-w-0 text-center lg:block lg:text-left">
            <p className="truncate text-[0.875rem] font-semibold text-[#1d1d1f] group-hover:text-[var(--brand-primary-dark)]">
              {displayName}
            </p>
            <p className="text-[0.75rem] text-[#86868b]">我的</p>
          </div>
        </Link>
      </div>

      <nav aria-label="主要功能" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} layout="side" pathname={pathname} />
        ))}

        <div className="my-2 border-t border-[var(--brand-border)]" />

        <p className="mb-1 hidden px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[#86868b] lg:block">
          快捷
        </p>
        {SIDE_NAV_EXTRA_LINKS.map((item) => (
          <SideExtraLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            pathname={pathname}
            title={item.title}
            waitingBadge={"waitingBadge" in item ? item.waitingBadge : false}
          />
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
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-[var(--brand-border)] bg-[var(--brand-surface)]/98 backdrop-blur-md [transform:translateZ(0)] supports-[padding:max(0px)]:pb-[max(0px,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3">
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
