import type { PersonalityProfile, PersonalityType } from "./types";

export const PERSONALITY_PROFILES: Record<PersonalityType, PersonalityProfile> = {
  A: {
    type: "A",
    animalName: "療癒胖象",
    tagline: "快樂補償型",
    emoji: "🐘",
    accent: "#f8b4c4",
    headline: "你不是管不住嘴，你是在用食物幫自己充電。",
    coreInsight: "壓力／情緒 → 食物 → 暫時舒緩。",
    scenarios: ["工作壓力大時特別想吃点心的時刻", "心情低落時用美食安慰自己", "覺得「今天已經很辛苦了」的犒賞時刻"],
    suggestions: [
      "找出最容易失控的情境",
      "不要一開始全面禁止喜歡的食物",
      "建立食物以外的壓力出口",
    ],
    aiDirection: "先問壓力與失控情境。",
  },
  B: {
    type: "B",
    animalName: "明天樹懶",
    tagline: "明天再開始型",
    emoji: "🦥",
    accent: "#d4c4a8",
    headline: "你缺的可能不是方法，而是一個小到不能再拖的開始。",
    coreInsight: "啟動成本過高。",
    scenarios: ["資料查很多但遲遲不開始", "等待完美時機", "覺得準備還不夠就再等等"],
    suggestions: ["不等完美時機", "第一個行動要非常小", "先累積成功感"],
    aiDirection: "先問最小可開始的一步。",
  },
  C: {
    type: "C",
    animalName: "暴衝兔",
    tagline: "三分鐘熱度型",
    emoji: "🐰",
    accent: "#ffb8a8",
    headline: "你的問題不是不夠努力，而是每次都太努力。",
    coreInsight: "執行強度過高，無法長期維持。",
    scenarios: ["前幾天超認真後突然歸零", "一次做太多改變", "用爆發力撐過前兩週"],
    suggestions: ["不用爆發力減脂", "建立最低可執行版本", "先追求持續，再提高強度"],
    aiDirection: "先問過去撐多久、哪裡開始太硬。",
  },
  D: {
    type: "D",
    animalName: "跑輪倉鼠",
    tagline: "努力錯方向型",
    emoji: "🐹",
    accent: "#c9b8f0",
    headline: "你可能不是做得不夠，而是努力沒有打在最有效的位置。",
    coreInsight: "資訊很多，方法不一定適合本人。",
    scenarios: ["換過很多方法卻沒有定論", "同時改飲食又改運動又改作息", "不知道哪一步真正有效"],
    suggestions: ["盤點現在真正做了什麼", "停止同時改很多事情", "找最高槓桿的調整點"],
    aiDirection: "先問目前實際在做什麼。",
  },
  E: {
    type: "E",
    animalName: "熬夜熊貓",
    tagline: "生活失控型",
    emoji: "🐼",
    accent: "#b8d4f0",
    headline: "不是你不自律，是你的生活每天都在打亂你的計畫。",
    coreInsight: "作息、工作、外食、環境破壞執行。",
    scenarios: ["加班後飲食全亂", "聚餐與社交難以配合", "睡眠不足影響食慾與選擇"],
    suggestions: ["找出最常發生的混亂場景", "建立外食／加班備案", "將睡眠、壓力納入管理"],
    aiDirection: "先問生活最常失控的場景。",
  },
  F: {
    type: "F",
    animalName: "突破獵豹",
    tagline: "差臨門一腳型",
    emoji: "🐆",
    accent: "#f0d48c",
    headline: "你不是從 0 開始，你只是需要找到最後那個突破點。",
    coreInsight: "已經有基礎，需要個人化調整。",
    scenarios: ["已有基本習慣但停滯", "知道方法但卡在同一階段", "想再優化而不是從頭來"],
    suggestions: ["量化目前狀態", "找出停滯來源", "一次只改最高影響因素"],
    aiDirection: "先問目前卡在哪個階段。",
  },
};

export function getPersonalityProfile(type: PersonalityType): PersonalityProfile {
  return PERSONALITY_PROFILES[type];
}

export const URGENCY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  very_high: "極高",
} as const;

export const READINESS_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  very_high: "極高",
} as const;

export const INTERACTION_PRIORITY_LABELS = {
  low: "一般",
  medium: "值得追蹤",
  high: "高",
  very_high: "🔥 極高",
} as const;
