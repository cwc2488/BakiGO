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
  waitingBadge?: boolean;
};

/**
 * Main hub IA — P0/P1 converged entries only.
 *
 * Canonical logged-in Partner Quiz Hub is `/quiz/21d` (21 天名單 / 我的分享 / 我的成效).
 * Public consumer Quiz (`/quiz/fat-loss`, `/q/{code}`) is a separate experience.
 * Do not replace the Partner Hub with the older simple `/quiz/hub` shell during baseline recovery.
 */
export const CUSTOMER_JOURNEY_HUB_ITEMS: CustomerJourneyHubItem[] = [
  {
    href: "/radar",
    title: "AI Radar",
    desc: "尋找新名單",
    iconName: APP_ICON.section.aiAnalysis,
  },
  {
    href: "/retail-pipeline",
    title: "我的名單",
    desc: "推進每位名單",
    iconHref: "/retail-pipeline",
  },
  {
    href: "/quiz/21d",
    title: "心理測驗",
    desc: "21 天名單・分享測驗・成效",
    iconHref: "/quiz/hub",
    waitingBadge: true,
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
