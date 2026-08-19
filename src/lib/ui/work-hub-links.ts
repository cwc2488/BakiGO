import { APP_ICON } from "@/lib/ui/app-icons";
import {
  MY_HOME_BUSINESS_ENTRIES,
  MY_HOME_MORE_ENTRIES,
} from "@/lib/home/my-home-presentation";

/**
 * @deprecated Prefer MY_HOME_BUSINESS_ENTRIES + MY_HOME_MORE_ENTRIES on home.
 * Kept as flat inventory of「我的」world routes (not bottom-nav concepts).
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

/** @deprecated Prefer MY_WORLD_SECONDARY_LINKS / Customer Journey Hub. Kept for legacy imports. */
export const SIMPLE_QUICK_LINKS = [
  { href: "/customers", title: "顧客" },
  { href: "/calendar", title: "行事曆" },
  { href: "/daily-action", title: "今日行動" },
  { href: "/coaching", title: "陪跑" },
  { href: "/learning", title: "學習" },
  { href: "/quiz/hub", title: "心理測驗" },
  { href: "/quiz/21d", title: "心理測驗工作台" },
] as const;

/** @deprecated Prefer three-world IA secondary lists. */
export const WORK_HUB_LINKS = MY_WORLD_SECONDARY_LINKS;

/** Desktop side nav extras — align with three-world IA (customer + my tools). */
export const SIDE_NAV_EXTRA_LINKS = [
  { href: "/quiz/21d", title: "心理測驗", icon: APP_ICON.hub.pipeline, waitingBadge: true },
  { href: "/coaching", title: "陪跑", icon: APP_ICON.hub.pipeline },
  { href: "/retail-pipeline", title: "名單", icon: APP_ICON.hub.pipeline },
  { href: "/goals", title: "目標", icon: APP_ICON.hub.goals },
  { href: "/organization", title: "組織", icon: APP_ICON.hub.organization },
  { href: "/learning", title: "學習", icon: APP_ICON.hub.learning },
] as const;
