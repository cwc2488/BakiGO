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
 * Customer hub IA after Production Cleanup — retained surfaces only.
 * Public consumer Quiz (`/quiz/fat-loss`, `/q/{code}`) remains a separate experience
 * and is not linked from this partner hub.
 */
export const CUSTOMER_JOURNEY_HUB_ITEMS: CustomerJourneyHubItem[] = [
  {
    href: "/customers/list",
    title: "我的顧客",
    desc: "顧客資料與追蹤",
    iconHref: "/customers",
  },
];
