/** Copy source of truth for the public 21-day Experience landing (mission V1). */

export const EXPERIENCE_21D_LANDING_VERSION = "experience_21d_v2" as const;

export const EXPERIENCE_21D_CONSULTATION_PREFERENCES = ["text", "phone", "in_person"] as const;
export type Experience21dConsultationPreference =
  (typeof EXPERIENCE_21D_CONSULTATION_PREFERENCES)[number];

export const EXPERIENCE_21D_LANDING = {
  brand: "Baki Go",
  badge: "AI 陪跑 × 真人教練 × 營養方案",
  hero: {
    eyebrow: "AI 深度分析後的下一步",
    headlineLines: ["不需要逼自己變外向，", "21 天，", "也可以用你舒服的方式開始。"] as const,
    support: "我們用 AI 理解你的狀況，每天陪你一點點調整，在你熟悉的生活裡，慢慢變好。",
    reassurances: [
      { title: "不用見面也沒關係", body: "文字就能溝通，有時間再回覆就好。" },
      { title: "不用講電話也可以", body: "不喜歡通話沒問題，我們尊重你的方式。" },
      { title: "互動程度由你決定", body: "想多聊就多聊，想安靜就安心執行。" },
    ] as const,
    scrollCue: "向下滑動看更多",
    earlyCta: "看看諮詢方式",
  },
  support: {
    heading: "這 21 天，我們會這樣陪你",
    lead: "AI 為主、真人支援、互動方式由你決定。在你需要的時候，給你剛剛好的幫助。",
    items: [
      {
        title: "AI 深度理解你",
        body: "理解你的動機、習慣、生活節奏與卡關點，找到真正影響體態管理的原因。",
      },
      {
        title: "為你制定專屬方案",
        body: "依你的目標與生活，提供飲食建議、活動安排與營養搭配，簡單到做得到。",
      },
      {
        title: "AI 日常陪跑為主",
        body: "每天記錄、分析、提醒與建議。有問題再問 AI，低壓陪你前進。",
      },
      {
        title: "真人教練支援",
        body: "需要更深討論、調整或鼓勵時，真人教練才會接手。不必每天被催促聊天。",
      },
      {
        title: "21 天回顧與下一步",
        body: "回顧成果與改變，一起調整下一階段方向，讓好習慣能繼續。",
      },
    ] as const,
  },
  flow: {
    heading: "21 天體驗流程",
    subheading: "一步一步，讓改變自然發生",
    stages: [
      {
        day: "DAY 1",
        title: "建立方向",
        bullets: ["了解你的現況與目標", "結合 AI 洞察，找出優先重點", "建立專屬計畫與優先順序"],
      },
      {
        day: "DAY 2–7",
        title: "開始執行",
        bullets: ["依計畫調整飲食與生活", "AI 每天陪你記錄與追蹤", "有問題再問，慢慢調整"],
      },
      {
        day: "DAY 8–14",
        title: "持續優化",
        bullets: ["根據執行與感受微調", "AI 給出更貼近你的建議", "逐步建立可持續的習慣"],
      },
      {
        day: "DAY 15–20",
        title: "看見改變",
        bullets: ["行為、習慣與一致性在升級", "AI 陪你突破停滯", "強化自信與正向循環"],
      },
      {
        day: "DAY 21",
        title: "回顧與下一步",
        bullets: ["檢視這 21 天的收穫", "整理下一階段方向", "決定如何繼續前進"],
      },
    ] as const,
    closing: "不用追求完美，只要每天比昨天的自己好一點點。",
  },
  suitable: {
    headingLines: ["為什麼這很適合", "不喜歡接觸人群的你？"] as const,
    subheading: "你可以安心做自己，我們給你空間與支持。",
    cards: [
      {
        title: "互動程度由你決定",
        body: "文字、通話或到場，依你舒服的方式選擇。節奏由你主導，不必勉強自己。",
      },
      {
        title: "隱私有保障",
        body: "你的申請與分析內容僅供負責的專業教練團隊用於後續諮詢與陪跑安排，不會公開分享。",
      },
      {
        title: "沒有即時壓力",
        body: "不用秒回、不用即時聊天，有時間再回覆就好。",
      },
      {
        title: "在熟悉的環境進行",
        body: "在家、在宿舍、在任何地方，用你舒服的方式前進。",
      },
    ] as const,
    closingLines: ["你不需要變得外向，", "只需要變得更好。"] as const,
  },
  consult: {
    heading: "選擇你最舒服的諮詢方式",
    lead: "先聊聊，再決定適不適合你。",
    options: [
      {
        id: "text" as const,
        badge: "推薦怕社交的你",
        title: "文字諮詢（推薦）",
        subtitle: "用文字慢慢聊，表達更自在",
        benefits: ["不用見面", "不用講電話", "有時間再回覆", "可以慢慢整理自己的想法"],
        recommended: true,
      },
      {
        id: "phone" as const,
        badge: "適合喜歡直接對談的你",
        title: "通話諮詢",
        subtitle: "想更快來回討論時，可以選擇語音通話",
        benefits: ["適合即時釐清問題", "直接與教練對談", "溝通節奏較快"],
        recommended: false,
      },
      {
        id: "in_person" as const,
        badge: "適合想面對面深入了解的你",
        title: "到場諮詢",
        subtitle: "想當面討論或需要現場評估時可選",
        benefits: ["適合完整評估", "面對面一起規劃", "地點由負責教練與你約定"],
        recommended: false,
      },
    ] as const,
    primaryCta: "申請 21 天體驗諮詢",
    reassurance: "先聊聊，再決定適不適合你。",
    successTitle: "申請已送出",
    successBody: "接下來會由負責的教練先看過你的分析，再依你選擇的方式與你聯繫。",
    successNote: "你不用再從頭把自己的故事講一次。",
  },
  analysisBridge: "你已經知道自己卡在哪裡。接下來，看看這 21 天我們可以怎麼陪你。",
} as const;

export function isExperience21dConsultationPreference(
  value: unknown,
): value is Experience21dConsultationPreference {
  return (
    typeof value === "string" &&
    (EXPERIENCE_21D_CONSULTATION_PREFERENCES as readonly string[]).includes(value)
  );
}

/** Partner-facing short labels for consultation preference. */
export function experience21dConsultationPreferenceLabel(
  value: string | null | undefined,
): string | null {
  if (!isExperience21dConsultationPreference(value)) return null;
  if (value === "text") return "文字";
  if (value === "phone") return "通話";
  return "到場";
}
