"use client";

import Link from "next/link";
import { ROUTE_ICON_COMPONENTS, type QuickLinkHref } from "@/components/ui/BrandIcons";
import { PARTNER_V2_SECONDARY_SHORTCUTS } from "@/lib/partner-v2/partner-navigation";

export function PartnerSecondaryShortcuts() {
  return (
    <section className="space-y-3">
      <h2 className="px-0.5 text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-[var(--pv2-text-muted)]">
        常用工具
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {PARTNER_V2_SECONDARY_SHORTCUTS.map((item) => {
          const Icon = ROUTE_ICON_COMPONENTS[item.href as QuickLinkHref];
          return (
            <Link
              key={item.href}
              className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-[var(--pv2-radius-md)] border border-[var(--pv2-border-subtle)] bg-[var(--pv2-surface)] px-2 py-3 text-center transition-colors hover:bg-[var(--pv2-surface-elevated)]"
              href={item.href}
            >
              {Icon ? <Icon className="text-[var(--pv2-brand-primary)]" size={22} /> : null}
              <span className="text-[0.8125rem] font-semibold text-[var(--pv2-text-primary)]">
                {item.title}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
