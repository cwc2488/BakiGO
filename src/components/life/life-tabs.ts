export const LIFE_TABS = [
  { id: "home", href: "/life", label: "首頁", icon: "⌂" },
  { id: "quick", href: "/life/quick", label: "記帳", icon: "✎" },
  { id: "goals", href: "/life/goals", label: "目標", icon: "◎" },
  { id: "analytics", href: "/life/analytics", label: "統計", icon: "▦" },
  { id: "assets", href: "/life/assets", label: "資產", icon: "◈" },
] as const;

export type LifeTabId = (typeof LIFE_TABS)[number]["id"];

export function lifeTabFromPath(pathname: string): LifeTabId | null {
  if (pathname === "/life" || pathname === "/life/") return "home";
  if (pathname === "/life/quick" || pathname.startsWith("/life/quick/")) return "quick";
  if (pathname === "/life/goals" || pathname.startsWith("/life/goals/")) return "goals";
  if (pathname === "/life/analytics" || pathname.startsWith("/life/analytics/")) {
    return "analytics";
  }
  if (pathname === "/life/assets" || pathname.startsWith("/life/assets/")) return "assets";
  return null;
}

export function lifeHrefForTab(tab: LifeTabId): string {
  return LIFE_TABS.find((t) => t.id === tab)?.href ?? "/life";
}

/** Non-tab Life routes (e.g. ledger) still use normal Next navigation. */
export function isLifeAuxPath(pathname: string): boolean {
  return pathname.startsWith("/life/ledger");
}
