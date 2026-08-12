import { APP_ICON } from "@/lib/ui/app-icons";

/** Secondary links under「我的」— not bottom-nav concepts. */
export const MY_WORLD_SECONDARY_LINKS = [
  { href: "/daily-action", title: "今日行動", desc: "完成度與快速記錄" },
  { href: "/goals", title: "我的目標", desc: "設定目標與進度" },
  { href: "/president-road", title: "晉升之路", desc: "資格與晉升進度" },
  { href: "/organization", title: "我的組織", desc: "夥伴狀況一覽" },
  { href: "/members", title: "夥伴", desc: "夥伴關懷與名單" },
  { href: "/retail-house", title: "零售屋", desc: "週分享與成交" },
  { href: "/leaderboard", title: "排行榜", desc: "本週前五 · 本月前十" },
  { href: "/learning", title: "學習", desc: "業務教學影片" },
  { href: "/promotions", title: "活動／促銷", desc: "獎勵與挑戰" },
  { href: "/events", title: "活動紀錄", desc: "從顧客或行事曆發起為主" },
  { href: "/pre-meeting-graphic", title: "會前會圖", desc: "資料合併輸出" },
  { href: "/profile", title: "個人資料／設定", desc: "帳號與顯示設定" },
] as const;

/** @deprecated Prefer MY_WORLD_SECONDARY_LINKS / Customer Journey Hub. Kept for legacy imports. */
export const SIMPLE_QUICK_LINKS = [
  { href: "/customers", title: "顧客" },
  { href: "/calendar", title: "行事曆" },
  { href: "/daily-action", title: "今日行動" },
  { href: "/coaching", title: "陪跑" },
  { href: "/learning", title: "學習" },
  { href: "/quiz/hub", title: "心理測驗" },
] as const;

/** @deprecated Prefer three-world IA secondary lists. */
export const WORK_HUB_LINKS = MY_WORLD_SECONDARY_LINKS;

/** Desktop side nav extras — align with three-world IA (customer + my tools). */
export const SIDE_NAV_EXTRA_LINKS = [
  { href: "/coaching", title: "陪跑", icon: APP_ICON.hub.pipeline },
  { href: "/retail-pipeline", title: "名單", icon: APP_ICON.hub.pipeline },
  { href: "/goals", title: "目標", icon: APP_ICON.hub.goals },
  { href: "/organization", title: "組織", icon: APP_ICON.hub.organization },
  { href: "/learning", title: "學習", icon: APP_ICON.hub.learning },
] as const;
