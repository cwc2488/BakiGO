"use client";

import type { MemberMonthlyPromotionsView } from "@/lib/promotions/promotion-selectors";
import type { PromotionConditionType } from "@/types/promotion-campaign";
import Link from "next/link";

const CONDITION_LABELS: Record<PromotionConditionType, string> = {
  consecutive_monthly_vp: "連續月份 VP 達標",
  single_month_vp: "單月 VP 達標",
  custom: "自訂條件",
};

function formatTierCondition(tier: MemberMonthlyPromotionsView["campaigns"][0]["tiers"][0]): string {
  if (tier.conditionType === "consecutive_monthly_vp") {
    return `${tier.startMonth || "—"} ～ ${tier.endMonth || "—"} 每月 ${tier.vpTarget ?? "—"} VP`;
  }
  if (tier.conditionType === "single_month_vp") {
    return `${tier.targetMonth || "—"} 完成 ${tier.vpTarget ?? "—"} VP`;
  }
  return tier.customCondition || "自訂條件";
}

function CompactCampaignItem({
  item,
}: {
  item: MemberMonthlyPromotionsView["campaigns"][0];
}) {
  const topTier = item.tiers[0];

  return (
    <article className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[1rem] font-semibold text-[#1d1d1f]">{item.campaign.title}</p>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">發布：{item.publisherName}</p>
        </div>
        {topTier ? (
          <span className="shrink-0 rounded-full bg-[var(--brand-primary-light)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--brand-primary-dark)]">
            {item.tiers.length} 重獎勵
          </span>
        ) : null}
      </div>
      {topTier ? (
        <p className="mt-2 text-[0.875rem] text-[#636366]">
          {topTier.rewardTitle}
          {item.tiers.length > 1 ? ` 等 ${item.tiers.length} 項` : ""}
        </p>
      ) : null}
    </article>
  );
}

function FullCampaignCard({
  item,
}: {
  item: MemberMonthlyPromotionsView["campaigns"][0];
}) {
  return (
    <article className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="border-b border-[var(--brand-border)] px-5 py-5">
        <p className="text-[0.8125rem] text-[#86868b]">發布：{item.publisherName}</p>
        <h3 className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">{item.campaign.title}</h3>
        {item.campaign.description ? (
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#636366]">
            {item.campaign.description}
          </p>
        ) : null}
        <p className="mt-3 text-[0.8125rem] text-[#86868b]">
          {item.campaign.startDate} ～ {item.campaign.endDate}
        </p>
      </div>

      <div className="space-y-3 p-5">
        {item.tiers.map((tier) => (
          <div key={tier.tierLevel} className="flex gap-3 rounded-2xl bg-[var(--brand-primary-muted)] p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--brand-primary)] text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]">
              {tier.tierLevel}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[1rem] font-semibold text-[#1d1d1f]">{tier.title}</p>
              <p className="mt-1 text-[0.8125rem] text-[var(--brand-primary-dark)]">
                {CONDITION_LABELS[tier.conditionType]}
              </p>
              <p className="mt-1 text-[0.875rem] text-[#636366]">{formatTierCondition(tier)}</p>
              <p className="mt-2 text-[0.9375rem] font-medium text-[#1d1d1f]">
                獎勵：{tier.rewardTitle}
              </p>
              {tier.rewardDescription ? (
                <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">{tier.rewardDescription}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function MonthlyPromotionsPanel({
  view,
  variant = "compact",
  showViewAllLink = false,
}: {
  view: MemberMonthlyPromotionsView;
  variant?: "compact" | "full";
  showViewAllLink?: boolean;
}) {
  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">本月促銷</h2>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">
            {view.yearMonthLabel} · 上線發布、下線可見
          </p>
        </div>
        {showViewAllLink ? (
          <Link className="shrink-0 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]" href="/promotions">
            全部 →
          </Link>
        ) : null}
      </div>

      {view.campaigns.length > 0 ? (
        <div className={`mt-4 ${variant === "full" ? "space-y-4" : "space-y-2.5"}`}>
          {view.campaigns.map((item) =>
            variant === "full" ? (
              <FullCampaignCard key={item.campaign.id} item={item} />
            ) : (
              <CompactCampaignItem key={item.campaign.id} item={item} />
            ),
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-[var(--brand-bg)] px-4 py-5 text-center">
          <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">本月尚無促銷</p>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">
            上線發布後，您與組織下線會在這裡看到當月挑戰。
          </p>
        </div>
      )}
    </section>
  );
}
