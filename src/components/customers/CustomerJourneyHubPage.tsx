"use client";

import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { AppIcon } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { ROUTE_ICON_COMPONENTS, type QuickLinkHref } from "@/components/ui/BrandIcons";
import type { AppIconName } from "@/components/ui/AppIcon";

type HubItem = {
  href?: string;
  title: string;
  desc: string;
  iconHref?: QuickLinkHref;
  iconName?: AppIconName;
  /** Soft placeholder — e.g. Radar / 轉介紹中心 */
  comingSoon?: boolean;
  /** Locked product entry — visible but not enterable */
  locked?: boolean;
  lockLabel?: string;
};

type HubSection = {
  title: string;
  subtitle: string;
  items: HubItem[];
};

const SECTIONS: HubSection[] = [
  {
    title: "找新顧客",
    subtitle: "開啟對話與名單來源",
    items: [
      {
        title: "AI Radar",
        desc: "智慧找人（開發中）",
        iconName: APP_ICON.section.aiAnalysis,
        comingSoon: true,
      },
      {
        href: "/retail-pipeline",
        title: "我的名單",
        desc: "推進每位名單",
        iconHref: "/retail-pipeline",
      },
      {
        href: "/quiz/hub",
        title: "心理測驗",
        desc: "用測驗開啟話題",
        iconHref: "/quiz/hub",
      },
    ],
  },
  {
    title: "正在接觸",
    subtitle: "從接觸到諮詢",
    items: [
      {
        href: "/retail-pipeline",
        title: "待聯絡／Pipeline",
        desc: "名單推進狀態",
        iconHref: "/retail-pipeline",
      },
      {
        title: "導引諮詢",
        desc: "正式諮詢流程尚未對外開放",
        iconHref: "/customers",
        locked: true,
        lockLabel: "即將開放",
      },
      {
        href: "/customers/list",
        title: "待諮詢顧客",
        desc: "從顧客列表跟進",
        iconHref: "/customers",
      },
    ],
  },
  {
    title: "我的顧客",
    subtitle: "顧客資料與追蹤",
    items: [
      {
        href: "/customers/list",
        title: "顧客列表",
        desc: "體組成與追蹤",
        iconHref: "/customers",
      },
    ],
  },
  {
    title: "陪跑",
    subtitle: "今天誰需要我？",
    items: [
      {
        href: "/coaching",
        title: "陪跑指揮中心",
        desc: "需要處理 · 觀察 · 回測 · 進展",
        iconHref: "/coaching",
      },
    ],
  },
  {
    title: "成果與分享",
    subtitle: "陪跑成果 → 體驗 → 適合分享 → 轉介紹",
    items: [
      {
        href: "/customers/referrals",
        title: "轉介紹中心",
        desc: "成果分享／朋友體驗／A 介紹 B",
        iconName: APP_ICON.section.growth,
      },
    ],
  },
];

function HubLinkCard({ item }: { item: HubItem }) {
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
      subtitle="找人 → 接觸 → 顧客 → 陪跑 → 成果與分享"
      variant="plain"
    >
      <div className="mx-auto max-w-lg space-y-8 px-4 pb-8 pt-2">
        {SECTIONS.map((section) => (
          <section key={section.title} className="min-w-0 space-y-3">
            <div>
              <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">{section.title}</h2>
              <p className="mt-0.5 text-[0.875rem] text-[#86868b]">{section.subtitle}</p>
            </div>
            <div className="space-y-2.5">
              {section.items.map((item) => (
                <HubLinkCard key={`${section.title}-${item.title}`} item={item} />
              ))}
            </div>
          </section>
        ))}
        <p className="text-center text-[0.8125rem] text-[#86868b]">
          轉介紹中心會列出你的所有顧客；陪跑詳情仍可查看成果與分享時機。
        </p>
      </div>
    </PageShell>
  );
}
