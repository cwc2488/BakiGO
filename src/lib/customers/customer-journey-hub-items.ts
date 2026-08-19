import { APP_ICON } from "@/lib/ui/app-icons";
import type { AppIconName } from "@/components/ui/AppIcon";
import type { QuickLinkHref } from "@/components/ui/BrandIcons";

export type CustomerJourneyHubItem = {
  href?: string;
  title: string;
  desc: string;
  iconHref?: QuickLinkHref;
  iconName?: AppIconName;
  comingSoon?: boolean;
  locked?: boolean;
  lockLabel?: string;
};

export type CustomerJourneyHubSection = {
  title: string;
  subtitle: string;
  items: CustomerJourneyHubItem[];
};

/** Customer Journey Hub IA — restored from 51f04e9 five-section layout. */
export const CUSTOMER_JOURNEY_HUB_SECTIONS: CustomerJourneyHubSection[] = [
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

export function flattenCustomerJourneyHubItems(
  sections: CustomerJourneyHubSection[] = CUSTOMER_JOURNEY_HUB_SECTIONS,
): CustomerJourneyHubItem[] {
  return sections.flatMap((section) => section.items);
}
