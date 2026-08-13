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

/** Main hub IA — P0/P1 converged entries only. */
export const CUSTOMER_JOURNEY_HUB_ITEMS: CustomerJourneyHubItem[] = [
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
    href: "/customers/list",
    title: "我的顧客",
    desc: "顧客資料與追蹤",
    iconHref: "/customers",
  },
  {
    href: "/coaching",
    title: "陪跑",
    desc: "今天誰需要我？",
    iconHref: "/coaching",
  },
  {
    href: "/customers/referrals",
    title: "轉介紹中心",
    desc: "成果分享／朋友體驗／A 介紹 B",
    iconName: APP_ICON.section.growth,
  },
];
