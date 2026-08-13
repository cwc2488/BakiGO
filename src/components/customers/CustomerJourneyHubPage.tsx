"use client";

import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { AppIcon } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { ROUTE_ICON_COMPONENTS } from "@/components/ui/BrandIcons";
import {
  CUSTOMER_JOURNEY_HUB_ITEMS,
  type CustomerJourneyHubItem,
} from "@/lib/customers/customer-journey-hub-items";

function HubLinkCard({ item }: { item: CustomerJourneyHubItem }) {
  const Icon = (item.iconHref ? ROUTE_ICON_COMPONENTS[item.iconHref] : null) ?? null;
  const badge = item.locked
    ? (item.lockLabel ?? "即將開放")
    : item.comingSoon
      ? item.title.includes("Radar")
        ? "開發中"
        : "建置中"
      : null;
  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]">
        {Icon ? (
          <Icon size={26} />
        ) : (
          <AppIcon name={item.iconName ?? APP_ICON.mood.empty} size={26} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 text-[1rem] font-semibold break-words text-[#1d1d1f] [overflow-wrap:anywhere]">
            {item.title}
          </span>
          {badge ? (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                item.locked
                  ? "bg-[#fff7e6] text-[#b54708]"
                  : "bg-[#f5f5f7] text-[#86868b]"
              }`}
            >
              {item.locked ? `🔒 ${badge}` : badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block min-w-0 text-[0.8125rem] break-words text-[#86868b] [overflow-wrap:anywhere]">
          {item.desc}
        </span>
      </span>
    </>
  );

  if (item.locked || item.comingSoon || !item.href) {
    return (
      <div
        aria-disabled="true"
        className={`flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border border-dashed border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 ${
          item.locked ? "opacity-90" : "opacity-80"
        }`}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      className="flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 transition-colors active:bg-[var(--brand-primary-muted)]"
      href={item.href}
    >
      {content}
    </Link>
  );
}

export default function CustomerJourneyHubPage() {
  return (
    <PageShell
      showBack={false}
      title="顧客"
      subtitle="名單 → 顧客 → 陪跑 → 轉介紹"
      variant="plain"
    >
      <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2">
        {CUSTOMER_JOURNEY_HUB_ITEMS.map((item) => (
          <HubLinkCard key={item.title} item={item} />
        ))}
        <p className="pt-4 text-center text-[0.8125rem] text-[#86868b]">
          待聯絡／正在接觸可在「我的名單」裡篩選；這裡只保留主入口。
        </p>
      </div>
    </PageShell>
  );
}
