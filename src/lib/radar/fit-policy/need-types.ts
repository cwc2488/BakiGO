export const FIT_POLICY_ID = "fit_policy_v1" as const;
export const FIT_POLICY_VERSION = "1.0.0" as const;

export const NEED_CATEGORIES = [
  "health_body",
  "nutrition_lifestyle",
  "career_income",
  "life_growth",
] as const;

export type NeedCategoryId = (typeof NEED_CATEGORIES)[number];

export const NEED_TYPE_SLUGS = [
  "body_composition_change",
  "weight_fat_management",
  "muscle_fitness_performance",
  "health_management",
  "nutrition_lifestyle",
  "income_pressure",
  "supplemental_income",
  "career_dissatisfaction",
  "entrepreneurship_autonomy",
  "personal_growth_life_change",
] as const;

export type NeedTypeSlug = (typeof NEED_TYPE_SLUGS)[number];

export type NeedRelevanceLevel =
  | "unrelated"
  | "adjacent"
  | "relevant"
  | "high_fit";

export type RelevanceEvidenceQuality = "direct" | "contextual" | "ambiguous";

export type NeedTypeDefinition = {
  slug: NeedTypeSlug;
  label_zh: string;
  category_id: NeedCategoryId;
  definition: string;
  positive_evidence_examples: string[];
  misclassification_guards: string[];
  default_relevance: NeedRelevanceLevel;
  relevance_ceiling: NeedRelevanceLevel;
  allow_multiple: true;
  is_umbrella: boolean;
};

/** Umbrella need — excluded from scored needs[] when specific needs exist. */
export const UMBRELLA_NEED_TYPE: NeedTypeSlug = "personal_growth_life_change";

export const SCORED_NEED_TYPES = NEED_TYPE_SLUGS.filter(
  (slug) => slug !== UMBRELLA_NEED_TYPE,
) as Exclude<NeedTypeSlug, typeof UMBRELLA_NEED_TYPE>[];

export const NEED_TYPE_DEFINITIONS: Record<NeedTypeSlug, NeedTypeDefinition> = {
  body_composition_change: {
    slug: "body_composition_change",
    label_zh: "體態改變",
    category_id: "health_body",
    definition:
      "Candidate 明確想改善整體體態、身型或外觀感受，且此目標已對其造成困擾或形成持續意圖。不要求任何搜尋、比較、詢問、嘗試或行動。",
    positive_evidence_examples: [
      "想改善體態",
      "對現在身型很不滿意",
      "希望看起來更精壯／更fit",
    ],
    misclassification_guards: [
      "僅自拍或健身打卡但無改善意圖",
      "商業減肥廣告轉發",
      "將『開始運動』誤判為 Need — 行動屬 Behavioral Change",
    ],
    default_relevance: "high_fit",
    relevance_ceiling: "high_fit",
    allow_multiple: true,
    is_umbrella: false,
  },
  weight_fat_management: {
    slug: "weight_fat_management",
    label_zh: "減脂／體重管理",
    category_id: "health_body",
    definition:
      "Candidate 明確以減重、降體脂或控制體重為目標，且此需求已造成困擾或形成持續意圖。不要求已開始記錄、搜尋方法或採取行動。",
    positive_evidence_examples: [
      "想減重",
      "想降體脂",
      "體重讓我很困擾",
      "非常想變瘦但還沒開始",
    ],
    misclassification_guards: [
      "一次性抱怨『又胖了』",
      "他人減肥故事分享",
      "『正在找減肥方法』— 屬 Change Window，不提高 Need Strength",
    ],
    default_relevance: "high_fit",
    relevance_ceiling: "high_fit",
    allow_multiple: true,
    is_umbrella: false,
  },
  muscle_fitness_performance: {
    slug: "muscle_fitness_performance",
    label_zh: "增肌／體能提升",
    category_id: "health_body",
    definition:
      "Candidate 明確想提升肌肉、體能、運動表現或恢復，且此目標已形成持續意圖或困擾。不要求已開始訓練或比較方法。",
    positive_evidence_examples: [
      "想增肌",
      "想提升體能",
      "希望跑更快／更有力",
    ],
    misclassification_guards: [
      "純運動打卡無改善目標",
      "專業運動員商業內容",
    ],
    default_relevance: "relevant",
    relevance_ceiling: "high_fit",
    allow_multiple: true,
    is_umbrella: false,
  },
  health_management: {
    slug: "health_management",
    label_zh: "健康管理",
    category_id: "health_body",
    definition:
      "Candidate 自己明確表達想改善整體健康或生活狀態（如睡眠、精神、體力、習慣），且未聚焦於單一減重或增肌目標。僅限 Candidate 自述目標；不得由 AI 推測疾病、診斷或檢查結果。",
    positive_evidence_examples: [
      "想改善睡眠",
      "想改善精神／體力",
      "想調整生活習慣",
      "想更好地管理自己的健康",
    ],
    misclassification_guards: [
      "推測糖尿病、高血壓等疾病",
      "引用健康檢查數值但 Candidate 未自行表達改善目標",
      "一般健康新聞轉發",
    ],
    default_relevance: "relevant",
    relevance_ceiling: "high_fit",
    allow_multiple: true,
    is_umbrella: false,
  },
  nutrition_lifestyle: {
    slug: "nutrition_lifestyle",
    label_zh: "飲食／作息改善",
    category_id: "nutrition_lifestyle",
    definition:
      "Candidate 明確想改善飲食、作息或生活型態以支持健康或生活品質。不要求已開始備餐、調整作息或採取行動。",
    positive_evidence_examples: [
      "想調整飲食",
      "想改善作息",
      "外食太多想改變",
      "想建立更好的飲食習慣",
    ],
    misclassification_guards: [
      "美食探店無改善意圖",
      "搜尋食譜／比較產品 — 屬 Behavioral Change",
    ],
    default_relevance: "high_fit",
    relevance_ceiling: "high_fit",
    allow_multiple: true,
    is_umbrella: false,
  },
  income_pressure: {
    slug: "income_pressure",
    label_zh: "收入壓力",
    category_id: "career_income",
    definition:
      "Candidate 明確表達財務壓力、開銷負擔或收入不足帶來的困擾。不要求正在尋找解法；若明確尋找額外收入來源，應使用 supplemental_income。",
    positive_evidence_examples: [
      "薪水不夠用",
      "財務壓力很大",
      "開銷讓我喘不過氣",
    ],
    misclassification_guards: [
      "缺錢因此自動升為 relevant/high_fit",
      "明確找副業 — 應建立 supplemental_income Need",
      "炫富或消費展示",
    ],
    default_relevance: "adjacent",
    relevance_ceiling: "adjacent",
    allow_multiple: true,
    is_umbrella: false,
  },
  supplemental_income: {
    slug: "supplemental_income",
    label_zh: "額外收入／副業",
    category_id: "career_income",
    definition:
      "Candidate 明確想增加收入、發展副業或額外收入來源，且此意圖已清楚存在。不要求已開始比較、詢問、報名或嘗試。",
    positive_evidence_examples: [
      "想找副業",
      "想多一個收入來源",
      "想增加額外收入",
      "想尋找可發展的兼職方向",
    ],
    misclassification_guards: [
      "僅收入壓力但無找解法意圖 — 用 income_pressure",
      "轉發副業廣告",
      "已開始比較機會 — 屬 Behavioral Change，不因此提高 Need Strength",
    ],
    default_relevance: "high_fit",
    relevance_ceiling: "high_fit",
    allow_multiple: true,
    is_umbrella: false,
  },
  career_dissatisfaction: {
    slug: "career_dissatisfaction",
    label_zh: "工作不滿／轉職",
    category_id: "career_income",
    definition:
      "Candidate 明確對現職不滿或想轉換工作跑道，且此意圖已存在。不要求正在投履歷或比較職缺。",
    positive_evidence_examples: [
      "想換工作",
      "受夠現在的公司",
      "想離開這份工作",
    ],
    misclassification_guards: [
      "工作吐槽無轉職意圖",
      "轉職意圖自動等於創業／事業機會 relevant",
    ],
    default_relevance: "adjacent",
    relevance_ceiling: "adjacent",
    allow_multiple: true,
    is_umbrella: false,
  },
  entrepreneurship_autonomy: {
    slug: "entrepreneurship_autonomy",
    label_zh: "創業／自主工作",
    category_id: "career_income",
    definition:
      "Candidate 明確想建立自己的事業、追求工作自主或脫離受雇結構，且此意圖已存在。不要求已開始創業、登記或採取行動。",
    positive_evidence_examples: [
      "想自己創業",
      "不想再看老板臉色",
      "想要時間自主",
      "想建立自己的事業",
    ],
    misclassification_guards: [
      "僅想換公司 — 用 career_dissatisfaction",
      "創業雞湯轉發",
      "已開始登記公司 — 屬 Behavioral Change",
    ],
    default_relevance: "relevant",
    relevance_ceiling: "high_fit",
    allow_multiple: true,
    is_umbrella: false,
  },
  personal_growth_life_change: {
    slug: "personal_growth_life_change",
    label_zh: "成長／人生改變",
    category_id: "life_growth",
    definition:
      "Candidate broadly 想讓人生更好或自我成長，但尚未聚焦到具體健康或事業需求。Umbrella need — 若已有更具體 scored need，不得同時放入 scored needs[]。",
    positive_evidence_examples: [
      "想讓生活不一樣",
      "想成為更好的自己",
      "今年想要真正改變",
    ],
    misclassification_guards: [
      "已有 weight_fat_management 等具體 need 時仍輸出此項到 scored needs",
      "用 broad 需求取代具體 need",
    ],
    default_relevance: "adjacent",
    relevance_ceiling: "adjacent",
    allow_multiple: true,
    is_umbrella: true,
  },
};

export function isNeedTypeSlug(value: string): value is NeedTypeSlug {
  return (NEED_TYPE_SLUGS as readonly string[]).includes(value);
}

export function getNeedTypeDefinition(slug: NeedTypeSlug): NeedTypeDefinition {
  return NEED_TYPE_DEFINITIONS[slug];
}
