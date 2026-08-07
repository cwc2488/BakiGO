import { APP_EMOJI, WORK_HUB_EMOJIS } from "@/lib/ui/app-emojis";

export const SIMPLE_QUICK_LINKS = [
  { href: "/retail-pipeline", title: "名單" },
  { href: "/daily-action", title: "今日行動" },
  { href: "/events", title: "新增紀錄" },
  { href: "/learning", title: "學習" },
] as const;

export const WORK_HUB_LINKS = [
  { href: "/daily-action", title: "今日行動", desc: "每天第一件事" },
  { href: "/goals", title: "目標中心", desc: "設定目標與進度" },
  { href: "/learning", title: "學習庫", desc: "業務教學影片" },
  { href: "/leaderboard", title: "積分排行", desc: "本週前五 · 本月前十" },
  { href: "/retail-pipeline", title: "名單", desc: "推進每位名單" },
  { href: "/pre-meeting-graphic", title: "會前會圖", desc: "資料合併輸出" },
  { href: "/retail-house", title: "零售屋", desc: "週分享與成交" },
  { href: "/organization", title: "組織圖", desc: "夥伴狀況一覽" },
  { href: "/promotions", title: "促銷專欄", desc: "獎勵與挑戰" },
  { href: "/calendar", title: "行事曆", desc: "行程與提醒" },
  { href: "/events", title: "紀錄中心", desc: "量測、諮詢、會議" },
  { href: "/president-road", title: "升級路線", desc: "資格與晉升進度" },
] as const;

/** 側邊欄捷徑 — 不在底部四個分頁裡的常用功能。 */
export const SIDE_NAV_EXTRA_LINKS = [
  { href: "/retail-pipeline", title: "名單", emoji: WORK_HUB_EMOJIS["/retail-pipeline"] },
  { href: "/goals", title: "目標", emoji: WORK_HUB_EMOJIS["/goals"] ?? "🎯" },
  { href: "/events", title: "紀錄", emoji: WORK_HUB_EMOJIS["/events"] ?? "📋" },
  { href: "/organization", title: "組織", emoji: WORK_HUB_EMOJIS["/organization"] ?? "🌳" },
  { href: "/learning", title: "學習", emoji: WORK_HUB_EMOJIS["/learning"] ?? "📚" },
  { href: "/president-road", title: "升級路線", emoji: WORK_HUB_EMOJIS["/president-road"] },
] as const;
