/**
 * QUIZ-AI-21 P2.3 approved question bank.
 * Original P2 12 questions remain as slots; extras are branch probes.
 * Next question is never "index + 1" — the engine selects from this bank.
 */

import {
  ANALYSIS_QUESTIONS,
  getAnalysisQuestion,
  type AnalysisQuestionDef,
} from "@/lib/analysis/analysis-questions";
import type { AnalysisBranchId, AnalysisSlotId } from "@/lib/analysis/analysis-dynamic-model";

export type AnalysisBankQuestion = AnalysisQuestionDef & {
  slot: AnalysisSlotId;
  branch: AnalysisBranchId | "core";
};

const FRONT_CORE: AnalysisBankQuestion[] = [
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "goal_focus")!,
    slot: "goal",
    branch: "core",
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "why_now")!,
    helpText: "不用想得太完整，照你現在想到的寫就好。",
    slot: "motivation",
    branch: "core",
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "why_stuck")!,
    slot: "stuck_pattern",
    branch: "core",
  },
];

const BACK_CORE: AnalysisBankQuestion[] = [
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "commitment")!,
    slot: "commitment",
    branch: "core",
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "safety_gate")!,
    slot: "safety",
    branch: "safety",
  },
];

const BRANCH_PROBES: AnalysisBankQuestion[] = [
  {
    id: "evening_loss_context",
    theme: "D",
    type: "single",
    engineType: "deterministic",
    slot: "trigger_pattern",
    branch: "emotional_eating",
    prompt: "最容易失控的時候，通常比較像哪一種情況？",
    helpText: "選最常發生的就好。",
    options: [
      { id: "mood", label: "心情不好或壓力大" },
      { id: "hungry", label: "白天吃太少，晚上太餓" },
      { id: "reward", label: "想犒賞自己、一天結束了" },
      { id: "give_up", label: "已經不想管了" },
      { id: "bored", label: "無聊或習慣性想吃" },
      { id: "other", label: "其他" },
    ],
  },
  {
    id: "eating_role",
    theme: "D",
    type: "single",
    engineType: "deterministic",
    slot: "trigger_pattern",
    branch: "emotional_eating",
    prompt: "那個時候吃東西，對你來說比較像？",
    options: [
      { id: "comfort", label: "安慰自己" },
      { id: "reward", label: "獎勵自己" },
      { id: "distract", label: "轉移注意" },
      { id: "give_up", label: "已經不想管了" },
      { id: "other", label: "其他" },
    ],
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "meal_pattern")!,
    slot: "eating_pattern",
    branch: "meal_rhythm",
  },
  {
    id: "shift_window",
    theme: "E",
    type: "single",
    engineType: "deterministic",
    slot: "life_context",
    branch: "time_work",
    prompt: "作息或工作最常讓飲食亂掉的，是哪一段？",
    options: [
      { id: "skip_day", label: "白天忙到沒吃" },
      { id: "after_work", label: "下班／交接後一次吃很多" },
      { id: "late_night", label: "深夜" },
      { id: "weekend_catchup", label: "假日補吃" },
      { id: "shift", label: "輪班／加班，時間不固定" },
    ],
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "work_style")!,
    slot: "life_context",
    branch: "time_work",
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "sleep_hours")!,
    slot: "sleep_pattern",
    branch: "sleep_fatigue",
  },
  {
    id: "failure_response",
    theme: "D",
    type: "single",
    engineType: "deterministic",
    slot: "stuck_pattern",
    branch: "consistency",
    prompt: "一次沒做到時，你通常會怎樣？",
    options: [
      { id: "restart_next_day", label: "隔天再重來" },
      { id: "drop_week", label: "整週或整段都放棄" },
      { id: "shame_then_more", label: "自責之後更容易放" },
      { id: "wait_perfect", label: "想等一個更完美的時機再開始" },
    ],
  },
  {
    id: "restart_friction",
    theme: "D",
    type: "single",
    engineType: "deterministic",
    slot: "stuck_pattern",
    branch: "consistency",
    prompt: "要再開始時，最卡的通常是？",
    options: [
      { id: "wasted", label: "覺得前面都白費了" },
      { id: "where", label: "不知道從哪裡接回來" },
      { id: "alone", label: "沒人盯、自己很容易鬆" },
      { id: "perfect_timing", label: "想等狀況更好再開始" },
    ],
  },
  {
    id: "knowledge_gap",
    theme: "G",
    type: "single",
    engineType: "deterministic",
    slot: "stuck_pattern",
    branch: "knowledge",
    prompt: "你現在比較卡在哪一種？",
    options: [
      { id: "what_to_eat", label: "不知道吃什麼才對" },
      { id: "know_cant_do", label: "知道，但做不到" },
      { id: "too_much_info", label: "資訊太多，不知道聽誰的" },
      { id: "already_know", label: "其實都知道，卡在持續" },
    ],
  },
  {
    id: "what_already_tried",
    theme: "G",
    type: "multi",
    engineType: "deterministic",
    slot: "stuck_pattern",
    branch: "knowledge",
    prompt: "你已經試過哪些？（可複選）",
    helpText: "有做過的都點一下就好。",
    options: [
      { id: "diet", label: "節食／算熱量" },
      { id: "gym", label: "健身或運動計畫" },
      { id: "self_study", label: "自己研究方法" },
      { id: "follow_plan", label: "跟過別人的計畫" },
      { id: "not_serious", label: "都還沒認真試過" },
    ],
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "help_wanted")!,
    slot: "support_preference",
    branch: "support",
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "trigger_context")!,
    slot: "trigger_pattern",
    branch: "emotional_eating",
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "activity_level")!,
    slot: "activity_pattern",
    branch: "body_context",
  },
  {
    ...ANALYSIS_QUESTIONS.find((q) => q.id === "body_stats")!,
    slot: "body_context",
    branch: "body_context",
  },
];

export const ANALYSIS_QUESTION_BANK: AnalysisBankQuestion[] = [
  ...FRONT_CORE,
  ...BRANCH_PROBES,
  ...BACK_CORE,
];

const BANK_BY_ID = new Map(ANALYSIS_QUESTION_BANK.map((q) => [q.id, q]));

export function getBankQuestion(id: string): AnalysisBankQuestion | null {
  return BANK_BY_ID.get(id) ?? null;
}

export function resolveAnalysisQuestion(id: string): AnalysisQuestionDef | null {
  return getBankQuestion(id) ?? getAnalysisQuestion(id);
}

export const FRONT_REQUIRED_QUESTION: Record<"goal" | "motivation" | "stuck_pattern", string> = {
  goal: "goal_focus",
  motivation: "why_now",
  stuck_pattern: "why_stuck",
};

export const BACK_REQUIRED_QUESTION: Record<"commitment" | "safety", string> = {
  commitment: "commitment",
  safety: "safety_gate",
};

/** Ordered probes per branch. Engine asks first unasked, up to maxDepth. */
export const BRANCH_PROBE_QUESTIONS: Record<
  AnalysisBranchId,
  { questionIds: string[]; maxDepth: number }
> = {
  emotional_eating: { questionIds: ["evening_loss_context", "eating_role"], maxDepth: 2 },
  meal_rhythm: { questionIds: ["meal_pattern"], maxDepth: 1 },
  time_work: { questionIds: ["shift_window"], maxDepth: 1 },
  sleep_fatigue: { questionIds: ["sleep_hours"], maxDepth: 1 },
  consistency: { questionIds: ["failure_response", "restart_friction"], maxDepth: 2 },
  motivation_identity: { questionIds: [], maxDepth: 0 },
  knowledge: { questionIds: ["knowledge_gap"], maxDepth: 1 },
  support: { questionIds: ["help_wanted"], maxDepth: 1 },
  body_context: { questionIds: ["body_stats"], maxDepth: 1 },
  safety: { questionIds: ["safety_gate"], maxDepth: 1 },
};

/** Legacy linear ids — used only to hydrate P2 partial sessions. */
export const LEGACY_LINEAR_QUESTION_IDS = ANALYSIS_QUESTIONS.map((q) => q.id);
