import type { NavHref } from "@/components/ui/BrandIcons";

/** Partner App V2 primary bottom navigation — newcomer-first core loop. */
export const PARTNER_V2_NAV_ITEMS = [
  { href: "/" as NavHref, label: "首頁", shortLabel: "首頁" },
  { href: "/retail-house" as NavHref, label: "零售屋", shortLabel: "零售屋" },
  { href: "/daily-action" as NavHref, label: "超級聯賽", shortLabel: "聯賽" },
  { href: "/organization" as NavHref, label: "組織", shortLabel: "組織" },
] as const;

/** Secondary utilities — not in bottom nav; reachable from home / profile. */
export const PARTNER_V2_SECONDARY_SHORTCUTS = [
  { href: "/customers", title: "顧客", description: "顧客與陪跑" },
  { href: "/calendar", title: "行事曆", description: "安排諮詢與量測" },
  { href: "/profile", title: "個人設定", description: "帳號與偏好" },
] as const;

/** Legacy partner features hidden from primary product surface (routes remain). */
export const PARTNER_V2_HIDDEN_LEGACY_ROUTES = [
  "/president-road",
  "/goals",
  "/leaderboard",
  "/members",
  "/events",
  "/retail-pipeline",
] as const;

export type PartnerV2HiddenLegacyRoute = (typeof PARTNER_V2_HIDDEN_LEGACY_ROUTES)[number];

export function isPartnerV2HiddenLegacyRoute(pathname: string): boolean {
  return PARTNER_V2_HIDDEN_LEGACY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
