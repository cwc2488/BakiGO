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
  comingSoon?: boolean;
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
        href: "/consultation/new",
        title: "導引諮詢",
        desc: "開始或繼續諮詢流程",
        iconHref: "/customers",
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
];

function HubLinkCard({ item }: { item: HubItem }) {
  const Icon =
    (item.iconHref ? ROUTE_ICON_COMPONENTS[item.iconHref] : null) ??
    null;
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
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 text-[1rem] font-semibold break-words text-[#1d1d1f] [overflow-wrap:anywhere]">
            {item.title}
          </span>
          {item.comingSoon ? (
            <span className="shrink-0 rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[0.6875rem] font-semibold text-[#86868b]">
              開發中
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block min-w-0 text-[0.8125rem] break-words text-[#86868b] [overflow-wrap:anywhere]">
          {item.desc}
        </span>
      </span>
    </>
  );

  if (item.comingSoon || !item.href) {
    return (
      <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border border-dashed border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 opacity-80">
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
    <PageShell showBack={false} title="顧客" subtitle="找人 → 接觸 → 顧客 → 陪跑" variant="plain">
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
          成果與分享機會在顧客陪跑詳情中查看，不另開主入口。
        </p>
      </div>
    </PageShell>
  );
}
