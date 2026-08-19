import { getPersonalityProfile } from "@/lib/quiz/fat-loss/personality-content";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import type { AnalysisIntakeAnswers } from "@/lib/analysis/analysis-questions";
import { READINESS_LABELS } from "@/lib/quiz/fat-loss/personality-content";
import { isFact, isKnown, type UnderstandingState } from "@/lib/analysis/interview/understanding-state";
import {
  selectLayer1Barrier,
  selectLayer1Motivation,
} from "@/lib/analysis/interview/interview-quality";

/**
 * P2.2 Layer1 — acknowledgement + one core stuck insight + optional change-state.
 * Not a full report. Does not dump body stats / lifestyle checklists to the consumer.
 * Full answers remain in DB and Layer2 input snapshot.
 */
export type AnalysisLayer1Report = {
  version: "analysis_layer1_v2";
  generatedAt: string;
  grounded: true;
  sections: {
    /** 1–2 sentence deterministic core stuck summary */
    coreStuck: string;
    /** 1 sentence when commitment / help_wanted support it; otherwise null */
    changeState: string | null;
    /** Generating hint — UI shows only while AI is still running */
    progress: string;
  };
  facts: {
    personalityType: PersonalityType;
    animalName: string;
    quizPrimaryGoal: string | null;
    safetyYes: boolean;
    commitmentScore: number | null;
    whyStuckId: string | null;
    triggerId: string | null;
    helpWantedId: string | null;
  };
  safety: {
    flagged: boolean;
    guidance: string | null;
  };
};

export const ANALYSIS_LAYER1_PROGRESS_COPY =
  "正在為你整理更深入的個人分析，你可以先離開，完成後再回來看。" as const;

const STUCK_CORE: Record<string, string> = {
  motivation: "動力一下子就掉",
  diet_control: "飲食容易失控",
  schedule: "作息與時間排不出來",
  knowledge: "還不確定怎麼做才對",
  support: "缺少陪伴與提醒",
  all_or_nothing: "一破功就容易整組放棄",
  other: "還有需要再釐清的卡點",
};

const TRIGGER_CORE: Record<string, string> = {
  night: "晚上容易因情境失控",
  stress: "壓力或心情差時容易失控",
  social: "聚餐應酬時容易失控",
  weekend: "假日容易失控",
  busy_skip: "太忙跳餐後反而吃更多",
  craving: "突然想吃時容易失控",
};

const HELP_CORE: Record<string, string> = {
  clarity: "希望先搞清楚自己卡在哪",
  simple_plan: "希望有一個簡單、做得到的方向",
  habit: "希望把生活習慣調穩",
  accountability: "希望有人陪著調整",
  not_sure: "想先看分析再決定",
};

export function buildCoreStuckSummary(
  answers: AnalysisIntakeAnswers,
  hint?: { primaryBranch?: string | null },
): string {
  const stuck = answers.why_stuck ? STUCK_CORE[answers.why_stuck] : null;
  const trigger = answers.trigger_context ? TRIGGER_CORE[answers.trigger_context] : null;
  const eveningMood = answers.evening_loss_context === "mood" || answers.evening_loss_context === "bored";
  const comfortEat = answers.eating_role === "comfort" || answers.eating_role === "distract";
  const skipMeals = answers.meal_pattern === "irregular_skip" || answers.meal_pattern === "night_heavy";
  const lifeChaos = answers.why_stuck === "schedule" || Boolean(answers.shift_window);
  const allOrNothing =
    answers.why_stuck === "all_or_nothing" ||
    answers.failure_response === "drop_week" ||
    answers.failure_response === "shame_then_more";

  if (stuck && trigger && stuck !== trigger) {
    return `從你的回答來看，目前最明顯的卡點是：${trigger}，而且${stuck}。`;
  }
  if ((eveningMood || comfortEat) && (hint?.primaryBranch === "emotional_eating" || !trigger)) {
    return "從你的回答來看，目前最明顯的卡點是：心情或壓力一來，就容易用吃的撐過去。";
  }
  if (skipMeals && lifeChaos) {
    return "從你的回答來看，目前最明顯的卡點是：生活時間讓飲食很難穩定，跳餐後更容易一次吃很多。";
  }
  if (allOrNothing && !trigger) {
    return "從你的回答來看，目前最明顯的卡點是：一破功就容易整組放棄，重新開始的摩擦很大。";
  }
  if (stuck) {
    return `從你的回答來看，目前最明顯的卡點是：${stuck}。`;
  }
  if (trigger) {
    return `從你的回答來看，目前最明顯的卡點是：${trigger}。`;
  }
  return "從你的回答來看，我們已掌握你目前的目標與生活節奏，接著會整理真正卡住的模式。";
}

function clipPhrase(value: string, max = 22): string {
  const t = value.trim().replace(/[。．.]+$/, "");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function buildCoreStuckFromUnderstanding(
  understanding: UnderstandingState,
  answers: AnalysisIntakeAnswers,
  hint?: { primaryBranch?: string | null },
): string {
  void answers;
  void hint;
  const motivation = selectLayer1Motivation(understanding);
  const barrier = selectLayer1Barrier(understanding);
  if (barrier && /血糖|紅字|血壓|膽固醇/.test(barrier) && !/不敢|沒辦法/.test(barrier)) {
    return "從這次訪談來看，健康檢查的資訊先當成背景，不把它寫成你卡住的原因。真正的行為卡點還要對齊你親口說過的部分。";
  }
  if (motivation && barrier) {
    const line = `從這次訪談來看，你在意的是${clipPhrase(motivation)}，而真正卡住的是${clipPhrase(barrier, 28)}。`;
    return line.includes("你就是") ? "從這次訪談來看，我們先整理你親口說過的重點，不把還沒確認的猜測寫成結論。" : line;
  }
  if (barrier) {
    return `從這次訪談來看，目前最明顯的卡點是：${clipPhrase(barrier, 36)}。`;
  }
  if (motivation) {
    return `從這次訪談來看，你在意的是${clipPhrase(motivation)}。真正卡住的地方還要再對齊你親口說過的部分。`;
  }
  return "從這次訪談來看，我們先整理你親口說過的重點，不把還沒確認的猜測寫成結論。";
}

export function buildChangeStateFromUnderstanding(
  understanding: UnderstandingState,
  answers: AnalysisIntakeAnswers,
): string | null {
  void answers;
  const fit = isFact(understanding.acceptable_change) ? understanding.acceptable_change.value : "";
  const ready = isFact(understanding.readiness_stage) ? understanding.readiness_stage.value : "";
  const readyOk = Boolean(ready && !/^(high|medium|low|very_high|高|中|低)$/i.test(ready.trim()));
  if (fit && readyOk) {
    return `你比較可能接受的是${clipPhrase(fit, 24)}，而且${clipPhrase(ready, 18)}。`;
  }
  if (fit) return `你比較可能接受的是${clipPhrase(fit, 28)}。`;
  if (readyOk) return `${clipPhrase(ready, 36)}。`;
  return null;
}

export function buildChangeStateSummary(answers: AnalysisIntakeAnswers): string | null {
  const score = typeof answers.commitment === "number" ? answers.commitment : null;
  const help = answers.help_wanted ? HELP_CORE[answers.help_wanted] : null;

  if (score == null && !help) return null;

  const willingness =
    score == null
      ? null
      : score >= 4
        ? "你的改變意願很高"
        : score === 3
          ? "你已有一定的改變意願"
          : "你目前比較想先了解情況";

  if (willingness && help) {
    return `${willingness}，而且${help}。`;
  }
  if (willingness) return `${willingness}。`;
  if (help) return `你${help}。`;
  return null;
}

export function buildAnalysisLayer1Report(input: {
  primaryType: PersonalityType;
  quizPrimaryGoal: string | null;
  quizActionHistoryLabels: string[];
  quizReadiness: string | null;
  answers: AnalysisIntakeAnswers;
  nowIso?: string;
  primaryBranch?: string | null;
  understanding?: UnderstandingState | null;
}): AnalysisLayer1Report {
  const profile = getPersonalityProfile(input.primaryType);
  const safetyYes =
    input.answers.safety_gate === "yes" ||
    Boolean(input.understanding && isKnown(input.understanding.safety_context));
  const commitmentScore =
    typeof input.answers.commitment === "number" ? input.answers.commitment : null;

  // quizActionHistoryLabels / quizReadiness intentionally unused in consumer Layer1 —
  // retained in answers / quiz snapshot for Layer2. Do not dump here.
  void input.quizActionHistoryLabels;
  void input.quizReadiness;

  const coreStuck = input.understanding
    ? buildCoreStuckFromUnderstanding(input.understanding, input.answers, {
        primaryBranch: input.primaryBranch,
      })
    : buildCoreStuckSummary(input.answers, { primaryBranch: input.primaryBranch });
  const changeState = input.understanding
    ? buildChangeStateFromUnderstanding(input.understanding, input.answers)
    : buildChangeStateSummary(input.answers);

  return {
    version: "analysis_layer1_v2",
    generatedAt: input.nowIso ?? new Date().toISOString(),
    grounded: true,
    sections: {
      coreStuck,
      changeState,
      progress: ANALYSIS_LAYER1_PROGRESS_COPY,
    },
    facts: {
      personalityType: input.primaryType,
      animalName: profile.animalName,
      quizPrimaryGoal: input.quizPrimaryGoal,
      safetyYes,
      commitmentScore,
      whyStuckId: input.answers.why_stuck ?? null,
      triggerId: input.answers.trigger_context ?? null,
      helpWantedId: input.answers.help_wanted ?? null,
    },
    safety: {
      flagged: safetyYes,
      guidance: safetyYes
        ? "你有提到醫師特別叮嚀的狀況。以下分析只做生活型態整理與一般性方向，不會提供疾病治療、診斷或醫療指示。"
        : null,
    },
  };
}

/** Progress stages for consumer UX — no fake %. */
export type AnalysisProgressStage =
  | "goal_understood"
  | "stuck_found"
  | "lifestyle_organized"
  | "ai_generating"
  | "ai_ready"
  | "ai_failed";

export function resolveAnalysisProgressStages(input: {
  analysisState: string;
  hasLayer1: boolean;
}): Array<{ id: AnalysisProgressStage; label: string; done: boolean; active: boolean }> {
  const state = input.analysisState;
  const hasLayer1 = input.hasLayer1;
  const aiDone = state === "ai_ready";
  const aiFailed = state === "ai_failed";
  const aiActive = state === "ai_generating" || state === "basic_report_ready";

  return [
    {
      id: "goal_understood",
      label: "了解你的目標",
      done: hasLayer1,
      active: false,
    },
    {
      id: "stuck_found",
      label: "找出真正卡住的地方",
      done: hasLayer1,
      active: false,
    },
    {
      id: "lifestyle_organized",
      label: "看看生活節奏",
      done: hasLayer1,
      active: false,
    },
    {
      id: "ai_generating",
      label: aiFailed
        ? "個人分析暫時無法完成（基本整理仍可看）"
        : aiDone
          ? "個人分析已完成"
          : "正在產生你的個人分析",
      done: aiDone,
      active: aiActive && !aiDone && !aiFailed,
    },
  ];
}

export { READINESS_LABELS };
