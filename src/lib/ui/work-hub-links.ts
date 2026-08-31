import { APP_ICON } from "@/lib/ui/app-icons";
import {
  MY_HOME_BUSINESS_ENTRIES,
  MY_HOME_MORE_ENTRIES,
} from "@/lib/home/my-home-presentation";

/**
 * @deprecated Prefer partner V2 navigation. Kept as flat inventory of routes.
 */
export const MY_WORLD_SECONDARY_LINKS = [
  ...MY_HOME_BUSINESS_ENTRIES.map((entry) => ({
    href: entry.href,
    title: entry.title,
    desc: "",
  })),
  ...MY_HOME_MORE_ENTRIES.map((entry) => ({
    href: entry.href,
    title: entry.title,
    desc: "",
  })),
] as const;

/** Desktop side nav extras — V2 secondary tools (not bottom-nav). */
export const SIDE_NAV_EXTRA_LINKS = [
  { href: "/customers", title: "顧客", icon: APP_ICON.hub.pipeline },
  { href: "/calendar", title: "行事曆", icon: APP_ICON.hub.calendar },
  { href: "/profile", title: "個人設定", icon: APP_ICON.page.profile },
  { href: "/quiz/21d", title: "心理測驗", icon: APP_ICON.hub.pipeline, waitingBadge: true },
  { href: "/coaching", title: "陪跑", icon: APP_ICON.hub.pipeline },
] as const;
