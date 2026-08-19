import { PRODUCTION_APP_ORIGIN } from "@/lib/app/public-origin";
import { RESET_ANIMAL_COPY } from "@/lib/analysis/reset/reset-animals";
import type { Experience21dStatus } from "@/lib/analysis/handoff/experience-21d-path";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";

export const QUIZ_PARTNER_OG_TITLE = "你比較像哪一種動物？｜Baki GO 心理測驗";
export const QUIZ_PARTNER_OG_DESCRIPTION =
  "6 個生活情境，看看你在想改變自己的時候，最容易進入哪一種模式。";
export const QUIZ_PARTNER_OG_IMAGE_PATH = "/reset/og-quiz-share.png";
export const QUIZ_PARTNER_OG_IMAGE_ALT = "你比較像哪一種動物？｜Baki GO 心理測驗角色系列";

export const QUIZ_PARTNER_OG_FORBIDDEN = [
  "21 天體驗",
  "21天體驗",
  "減重方案",
  "產品",
  "營養品",
  "賀寶芙",
  "Herbalife",
  "教練諮詢",
  "免費諮詢",
  "會員",
  "事業機會",
  "創業",
  "收入",
  "直銷",
  "成交",
  "購買",
  "優惠",
  "折扣",
] as const;

export const QUIZ_PARTNER_EMPTY_RATE = "還沒有資料";

export type QuizPartnerUiStatus = "waiting" | "contacted" | "joined" | "declined";

export const QUIZ_PARTNER_STATUS_LABEL: Record<QuizPartnerUiStatus, string> = {
  waiting: "待聯絡",
  contacted: "已聯絡",
  joined: "已成交",
  declined: "未成交",
};

export function toQuizPartnerUiStatus(status: Experience21dStatus | string): QuizPartnerUiStatus {
  if (status === "interested") return "waiting";
  if (status === "contacted" || status === "considering") return "contacted";
  if (status === "joined") return "joined";
  return "declined";
}

export function quizPartnerStatusRank(status: Experience21dStatus | string): number {
  const ui = toQuizPartnerUiStatus(status);
  if (ui === "waiting") return 0;
  if (ui === "contacted") return 1;
  return 2;
}

export type QuizPartnerLeadSortInput = {
  id: string;
  status: Experience21dStatus | string;
  createdAt: string;
  updatedAt?: string | null;
};

export function sortQuizPartnerLeads<T extends QuizPartnerLeadSortInput>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const rank = quizPartnerStatusRank(a.status) - quizPartnerStatusRank(b.status);
    if (rank !== 0) return rank;
    const aUi = toQuizPartnerUiStatus(a.status);
    const aTime = aUi === "contacted" ? (a.updatedAt || a.createdAt) : a.createdAt;
    const bTime = toQuizPartnerUiStatus(b.status) === "contacted" ? (b.updatedAt || b.createdAt) : b.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

export function displayConfirmedText(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text || text === "尚未確認") return "尚未確認";
  return text;
}

export function formatRelativeZh(iso: string, nowMs = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const delta = Math.max(0, nowMs - then);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW");
}

export function animalPresentation(type: string | null | undefined): {
  type: string | null;
  name: string;
  emoji: string;
  label: string;
} {
  const code = type && type in RESET_ANIMAL_COPY ? (type as PersonalityType) : null;
  if (!code) return { type: null, name: "", emoji: "", label: "" };
  const copy = RESET_ANIMAL_COPY[code];
  return {
    type: code,
    name: copy.animalName,
    emoji: copy.emoji,
    label: `${copy.emoji} ${copy.animalName}`,
  };
}

export function partnerSourceLabel(source: string | null | undefined): string {
  if (source === "reset_quiz_v2") return "心理測驗";
  return source?.trim() || "心理測驗";
}

export function isOpaqueShareCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  if (normalized.length < 5 || normalized.length > 7) return false;
  if (!/^[A-Z0-9]+$/.test(normalized)) return false;
  const uuid =
    /^[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
  return !uuid.test(normalized);
}

export function canonicalQuizShareHref(shareCode: string): string {
  return `${PRODUCTION_APP_ORIGIN}/q/${shareCode.toUpperCase()}`;
}

export function canonicalQuizShareDisplay(shareCode: string): string {
  return `bakigo.tw/q/${shareCode.toUpperCase()}`;
}

export type QuizPartnerRange = "7d" | "month" | "all";

export const QUIZ_PARTNER_RANGE_LABEL: Record<QuizPartnerRange, string> = {
  "7d": "近 7 天",
  month: "本月",
  all: "全部",
};

export function startOfTaipeiMonthIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}-01T00:00:00+08:00`;
}

export function rangeStartIso(range: QuizPartnerRange, now = new Date()): string | null {
  if (range === "all") return null;
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return startOfTaipeiMonthIso(now);
}

export function formatFunnelRate(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return QUIZ_PARTNER_EMPTY_RATE;
  }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function monthNewStartIso(now = new Date()): string {
  return startOfTaipeiMonthIso(now);
}

export type QuizPartnerContactAction = {
  label: string;
  display: string;
  openHref: string | null;
  openLabel: string | null;
  copyValue: string | null;
  copyLabel: string | null;
};

export function buildPartnerContactActions(
  channel: string | null,
  value: string | null,
): QuizPartnerContactAction | null {
  if (!channel || !value) return null;
  if (channel === "line") {
    return {
      label: "LINE",
      display: `LINE ID  ${value}`,
      openHref: null,
      openLabel: null,
      copyValue: value,
      copyLabel: "複製 LINE ID",
    };
  }
  if (channel === "instagram") {
    return {
      label: "Instagram",
      display: `Instagram @${value}`,
      openHref: `https://www.instagram.com/${value}/`,
      openLabel: "開啟 Instagram",
      copyValue: value,
      copyLabel: null,
    };
  }
  if (channel === "phone") {
    return {
      label: "手機",
      display: value,
      openHref: `tel:${value}`,
      openLabel: "撥打",
      copyValue: value,
      copyLabel: "複製",
    };
  }
  return null;
}
