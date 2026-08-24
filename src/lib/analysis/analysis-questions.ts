/**
 * QUIZ-AI-21 P2 Decision Tree — deterministic structured intake.
 * Reuses quiz personality/goal/readiness/action_history — does not re-ask those.
 */

export const ANALYSIS_INTAKE_SCHEMA_VERSION_V1 = "analysis_intake_v1" as const;
/** P2 linear intake. P2.3 sessions persist `analysis_intake_v2` + `__engine` in answers_json. */
export const ANALYSIS_INTAKE_SCHEMA_VERSION = ANALYSIS_INTAKE_SCHEMA_VERSION_V1;

export type AnalysisQuestionType = "single" | "multi" | "scale" | "number_pair" | "free_text" | "yes_no";

export type AnalysisQuestionOption = {
  id: string;
  label: string;
};

export type AnalysisQuestionDef = {
  id: string;
  /** A–G product themes */
  theme: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "safety";
  type: AnalysisQuestionType;
  /** TYPE1 deterministic | TYPE2 free text (no LLM gate) | never TYPE3 here */
  engineType: "deterministic" | "free_text";
  prompt: string;
  helpText?: string;
  options?: AnalysisQuestionOption[];
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: { min: string; max: string };
  numberFields?: Array<{ key: string; label: string; min: number; max: number; unit: string }>;
  optional?: boolean;
  maxLength?: number;
};

/** Ordered Decision Tree. Next question is always index+1 (linear). No LLM branching. */
export const ANALYSIS_QUESTIONS: AnalysisQuestionDef[] = [
  {
    id: "goal_focus",
    theme: "A",
    type: "single",
    engineType: "deterministic",
    prompt: "這次你最想先改善的是？",
    helpText: "可以跟心理測驗結果一樣，也可以更具體一點。",
    options: [
      { id: "waist", label: "腰腹變小" },
      { id: "weight", label: "體重下降" },
      { id: "body_fat", label: "體脂下降" },
      { id: "shape", label: "線條更好看" },
      { id: "energy", label: "體力／精神更好" },
      { id: "clothes", label: "穿衣服更有自信" },
      { id: "other", label: "其他體態相關目標" },
    ],
  },
  {
    id: "why_now",
    theme: "B",
    type: "free_text",
    engineType: "free_text",
    prompt: "為什麼現在特別想改變？",
    helpText: "不用想得太完整，照你現在想到的寫就好。",
    maxLength: 200,
  },
  {
    id: "why_stuck",
    theme: "D",
    type: "single",
    engineType: "deterministic",
    prompt: "過去比較難持續時，你覺得最卡的是？",
    options: [
      { id: "motivation", label: "動力一下子就沒了" },
      { id: "diet_control", label: "飲食容易失控" },
      { id: "schedule", label: "作息／時間排不出來" },
      { id: "knowledge", label: "不知道怎麼做才對" },
      { id: "support", label: "沒有人陪／沒人提醒" },
      { id: "all_or_nothing", label: "一破功就整組放棄" },
      { id: "other", label: "其他" },
    ],
  },
  {
    id: "body_stats",
    theme: "E",
    type: "number_pair",
    engineType: "deterministic",
    prompt: "目前大概的身高與體重？",
    helpText: "只用於生活型態摘要，不會用來診斷。",
    numberFields: [
      { key: "height_cm", label: "身高", min: 120, max: 230, unit: "cm" },
      { key: "weight_kg", label: "體重", min: 30, max: 250, unit: "kg" },
    ],
  },
  {
    id: "meal_pattern",
    theme: "E",
    type: "single",
    engineType: "deterministic",
    prompt: "平常三餐大致比較像？",
    options: [
      { id: "regular_home", label: "大多自己準備／較規律" },
      { id: "mixed", label: "有時自己吃、有時外食" },
      { id: "mostly_out", label: "大多外食或外送" },
      { id: "irregular_skip", label: "常不固定，有時直接略過" },
      { id: "night_heavy", label: "白天吃少、晚上吃比較多" },
    ],
  },
  {
    id: "trigger_context",
    theme: "D",
    type: "single",
    engineType: "deterministic",
    prompt: "最容易失控的時間或情境？",
    options: [
      { id: "night", label: "晚上／宵夜" },
      { id: "stress", label: "壓力大、心情差" },
      { id: "social", label: "聚餐／應酬" },
      { id: "weekend", label: "假日" },
      { id: "busy_skip", label: "太忙跳餐後反吃更多" },
      { id: "craving", label: "突然很想吃甜的／鹹的" },
    ],
  },
  {
    id: "sleep_hours",
    theme: "E",
    type: "single",
    engineType: "deterministic",
    prompt: "平均每天大概睡多久？",
    options: [
      { id: "under_5", label: "不到 5 小時" },
      { id: "5_6", label: "大約 5–6 小時" },
      { id: "6_7", label: "大約 6–7 小時" },
      { id: "7_8", label: "大約 7–8 小時" },
      { id: "over_8", label: "超過 8 小時" },
      { id: "irregular", label: "很不固定" },
    ],
  },
  {
    id: "activity_level",
    theme: "E",
    type: "single",
    engineType: "deterministic",
    prompt: "每週活動／運動狀況比較像？",
    options: [
      { id: "none", label: "幾乎沒有" },
      { id: "light", label: "偶爾走走或伸展" },
      { id: "moderate", label: "一週 1–2 次有意識活動" },
      { id: "frequent", label: "一週 3 次以上" },
      { id: "intense", label: "訓練很多，但飲食不一定穩" },
    ],
  },
  {
    id: "work_style",
    theme: "E",
    type: "single",
    engineType: "deterministic",
    prompt: "工作型態比較接近？",
    options: [
      { id: "sedentary", label: "久坐為主" },
      { id: "on_feet", label: "走動多" },
      { id: "physical", label: "勞力／體力工作" },
      { id: "irregular", label: "作息不固定（輪班／常加班）" },
    ],
  },
  {
    id: "commitment",
    theme: "F",
    type: "scale",
    engineType: "deterministic",
    prompt: "如果有適合你的方法，你現在願意投入的程度？",
    helpText: "1 = 先了解就好；5 = 很想認真開始。",
    scaleMin: 1,
    scaleMax: 5,
    scaleLabels: { min: "先了解", max: "很想開始" },
  },
  {
    id: "help_wanted",
    theme: "G",
    type: "single",
    engineType: "deterministic",
    prompt: "你最希望先得到什麼幫助？",
    options: [
      { id: "clarity", label: "搞清楚自己卡在哪" },
      { id: "simple_plan", label: "一個簡單、做得到的方向" },
      { id: "habit", label: "把生活習慣調穩" },
      { id: "accountability", label: "有人提醒、陪著前進" },
      { id: "not_sure", label: "還不確定，想先看分析" },
    ],
  },
  {
    id: "safety_gate",
    theme: "safety",
    type: "yes_no",
    engineType: "deterministic",
    prompt: "目前是否有醫師要求你特別注意的飲食、運動或健康狀況？",
    helpText: "若有，仍可完成分析，但不會提供醫療治療或診斷建議。",
  },
];

export function getAnalysisQuestion(id: string): AnalysisQuestionDef | null {
  return ANALYSIS_QUESTIONS.find((q) => q.id === id) ?? null;
}

export function getFirstAnalysisQuestionId(): string {
  return ANALYSIS_QUESTIONS[0]!.id;
}

export function getNextAnalysisQuestionId(currentId: string): string | null {
  const idx = ANALYSIS_QUESTIONS.findIndex((q) => q.id === currentId);
  if (idx < 0) return getFirstAnalysisQuestionId();
  const next = ANALYSIS_QUESTIONS[idx + 1];
  return next?.id ?? null;
}

export function getAnalysisQuestionProgress(currentId: string | null): {
  current: number;
  total: number;
} {
  const total = ANALYSIS_QUESTIONS.length;
  if (!currentId) return { current: 1, total };
  const idx = ANALYSIS_QUESTIONS.findIndex((q) => q.id === currentId);
  return { current: idx >= 0 ? idx + 1 : 1, total };
}

export type AnalysisIntakeAnswers = {
  goal_focus?: string;
  why_now?: string;
  why_stuck?: string;
  body_stats?: { height_cm: number; weight_kg: number };
  meal_pattern?: string;
  trigger_context?: string;
  sleep_hours?: string;
  activity_level?: string;
  work_style?: string;
  commitment?: number;
  help_wanted?: string;
  safety_gate?: "yes" | "no";
  evening_loss_context?: string;
  eating_role?: string;
  shift_window?: string;
  failure_response?: string;
  restart_friction?: string;
  knowledge_gap?: string;
  what_already_tried?: string[];
};

export function optionLabel(questionId: string, optionId: string | undefined): string | null {
  if (!optionId) return null;
  const q = getAnalysisQuestion(questionId);
  return q?.options?.find((o) => o.id === optionId)?.label ?? null;
}

export function validateAnswerForQuestion(
  question: AnalysisQuestionDef,
  value: unknown,
): string | null {
  if (question.type === "free_text") {
    if (typeof value !== "string" || !value.trim()) return "請用一句話回答。";
    if (question.maxLength && value.trim().length > question.maxLength) {
      return `請控制在 ${question.maxLength} 字以內。`;
    }
    return null;
  }
  if (question.type === "yes_no") {
    if (value !== "yes" && value !== "no") return "請選擇是或否。";
    return null;
  }
  if (question.type === "scale") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(n) || n < (question.scaleMin ?? 1) || n > (question.scaleMax ?? 5)) {
      return "請選擇有效分數。";
    }
    return null;
  }
  if (question.type === "number_pair") {
    if (!value || typeof value !== "object") return "請填寫身高與體重。";
    const record = value as Record<string, unknown>;
    for (const field of question.numberFields ?? []) {
      const n = Number(record[field.key]);
      if (!Number.isFinite(n) || n < field.min || n > field.max) {
        return `請填寫合理的${field.label}（${field.min}–${field.max}${field.unit}）。`;
      }
    }
    return null;
  }
  if (question.type === "single") {
    if (typeof value !== "string" || !question.options?.some((o) => o.id === value)) {
      return "請選擇一個選項。";
    }
    return null;
  }
  if (question.type === "multi") {
    if (!Array.isArray(value) || value.length === 0) return "請至少選擇一項。";
    return null;
  }
  return "無效的回答。";
}

export function isIntakeComplete(answers: AnalysisIntakeAnswers): boolean {
  for (const q of ANALYSIS_QUESTIONS) {
    const raw = (answers as Record<string, unknown>)[q.id];
    if (validateAnswerForQuestion(q, raw) !== null) return false;
  }
  return true;
}
