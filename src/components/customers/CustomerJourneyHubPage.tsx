"use client";

import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { AppIcon } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { ROUTE_ICON_COMPONENTS } from "@/components/ui/BrandIcons";
import { QuizPartnerNavBadge } from "@/components/quiz/QuizPartnerNavBadge";
import {
  CUSTOMER_JOURNEY_HUB_ITEMS,
  type CustomerJourneyHubItem,
} from "@/lib/customers/customer-journey-hub-items";

function HubLinkCard({ item }: { item: CustomerJourneyHubItem }) {
  const Icon = (item.iconHref ? ROUTE_ICON_COMPONENTS[item.iconHref] : null) ?? null;
  const badge = item.locked ? (item.lockLabel ?? "即將開放") : null;

  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]">
        {Icon ? (
          <Icon size={22} />
        ) : (
          <AppIcon name={item.iconName ?? APP_ICON.mood.empty} size={22} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 text-[0.9375rem] font-semibold break-words text-[var(--brand-text)] [overflow-wrap:anywhere]">
            {item.title}
          </span>
          {item.waitingBadge ? <QuizPartnerNavBadge /> : null}
          {badge ? (
            <span className="shrink-0 rounded-full bg-[#fff7e6] px-2 py-0.5 text-[0.6875rem] font-semibold text-[#b54708]">
              🔒 {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block min-w-0 text-[0.8125rem] break-words text-[var(--brand-text-muted)] [overflow-wrap:anywhere]">
          {item.desc}
        </span>
      </span>
      {!item.locked && item.href ? (
        <span aria-hidden className="text-[0.875rem] text-[var(--brand-hint)]">
          ›
        </span>
      ) : null}
    </>
  );

  if (item.locked || !item.href) {
    return (
      <div
        aria-disabled="true"
        className="flex min-h-[3.25rem] min-w-0 items-center gap-3.5 px-4 py-3 opacity-90"
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      className="flex min-h-[3.25rem] min-w-0 items-center gap-3.5 px-4 py-3 transition-colors active:bg-[var(--brand-primary-muted)]"
      href={item.href}
    >
      {content}
    </Link>
  );
}

export default function CustomerJourneyHubPage() {
  return (
    <PageShell showBack={false} subtitle="名單 → 顧客 → 陪跑 → 轉介紹" title="顧客" variant="plain">
      <div className="overflow-hidden rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] shadow-[0_1px_2px_rgba(29,29,31,0.04)]">
        {CUSTOMER_JOURNEY_HUB_ITEMS.map((item, index) => (
          <div
            key={item.title}
            className={index > 0 ? "border-t border-[var(--brand-border)]/70" : undefined}
          >
            <HubLinkCard item={item} />
          </div>
        ))}
      </div>
      <p className="pt-2 text-center text-[0.75rem] leading-relaxed text-[var(--brand-hint)]">
        待聯絡／正在接觸可在「我的名單」裡篩選
      </p>
    </PageShell>
  );
}
