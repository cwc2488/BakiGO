/**
 * QUIZ-AI-21 P2.3 Hybrid Dynamic Decision Engine.
 * Program owns next-question, stop, safety, persistence. No OpenAI.
 */

import type { AnalysisIntakeAnswers } from "@/lib/analysis/analysis-questions";
import { validateAnswerForQuestion } from "@/lib/analysis/analysis-questions";
import {
  ANALYSIS_BACK_REQUIRED_SLOTS,
  ANALYSIS_BRANCH_IDS,
  ANALYSIS_ENGINE_META_KEY,
  ANALYSIS_ENGINE_VERSION,
  ANALYSIS_FRONT_REQUIRED_SLOTS,
  ANALYSIS_SLOT_IDS,
  ANALYSIS_STOP,
  createEmptyBranchScores,
  createEmptySlots,
  type AnalysisBranchId,
  type AnalysisEngineState,
  type AnalysisMilestone,
  type AnalysisNextStep,
  type AnalysisQuizSignals,
  type AnalysisReflection,
  type AnalysisSlotId,
  type AnalysisSlotState,
} from "@/lib/analysis/analysis-dynamic-model";
import {
  BACK_REQUIRED_QUESTION,
  BRANCH_PROBE_QUESTIONS,
  FRONT_REQUIRED_QUESTION,
  LEGACY_LINEAR_QUESTION_IDS,
  getBankQuestion,
  resolveAnalysisQuestion,
} from "@/lib/analysis/analysis-question-bank";

const ENTRY_THRESHOLD = 2;

export function stripEngineMeta(raw: Record<string, unknown> | null | undefined): AnalysisIntakeAnswers {
  if (!raw) return {};
  const { [ANALYSIS_ENGINE_META_KEY]: _ignored, ...rest } = raw;
  void _ignored;
  return rest as AnalysisIntakeAnswers;
}

export function packAnswersWithEngine(
  answers: AnalysisIntakeAnswers,
  engine: AnalysisEngineState,
): Record<string, unknown> {
  return {
    ...(answers as Record<string, unknown>),
    [ANALYSIS_ENGINE_META_KEY]: engine,
  };
}

export function readEngineFromAnswers(raw: Record<string, unknown> | null | undefined): AnalysisEngineState | null {
  const meta = raw?.[ANALYSIS_ENGINE_META_KEY];
  if (!meta || typeof meta !== "object") return null;
  const engine = meta as AnalysisEngineState;
  if (engine.version !== ANALYSIS_ENGINE_VERSION) return null;
  if (!engine.slots || !engine.askedQuestionIds) return null;
  return engine;
}

export function createInitialEngine(quiz: AnalysisQuizSignals): AnalysisEngineState {
  const slots = createEmptySlots();
  if (quiz.primaryGoal) {
    slots.goal = {
      status: "partial",
      source: "quiz",
      confidence: 0.4,
      evidenceQuestionIds: [],
    };
  }
  const engine: AnalysisEngineState = {
    version: ANALYSIS_ENGINE_VERSION,
    slots,
    branchScores: createEmptyBranchScores(),
    askedQuestionIds: [],
    reflections: [],
    lastReflection: null,
    currentQuestionId: null,
    completionReason: null,
    quiz,
  };
  applyQuizPriors(engine);
  return engine;
}

function slotSufficient(slot: AnalysisSlotState): boolean {
  return slot.status === "sufficient" || slot.status === "not_relevant";
}

function markSlot(
  engine: AnalysisEngineState,
  slot: AnalysisSlotId,
  patch: Partial<AnalysisSlotState>,
  questionId: string,
): void {
  const current = engine.slots[slot];
  const evidence = current.evidenceQuestionIds.includes(questionId)
    ? current.evidenceQuestionIds
    : [...current.evidenceQuestionIds, questionId];
  engine.slots[slot] = {
    ...current,
    ...patch,
    evidenceQuestionIds: evidence,
  };
}

function addScore(engine: AnalysisEngineState, branch: AnalysisBranchId, delta: number): void {
  engine.branchScores[branch] = (engine.branchScores[branch] ?? 0) + delta;
}

function classifyWhyNow(text: string, engine: AnalysisEngineState): void {
  const t = text;
  if (/輪班|加班|作息不固定|沒時間|太忙|交接/.test(t)) {
    addScore(engine, "time_work", 2);
    addScore(engine, "meal_rhythm", 1);
  }
  if (/跳餐|沒吃|晚上.{0,6}吃|一次吃很多|很餓|亂吃/.test(t)) {
    addScore(engine, "meal_rhythm", 2);
  }
  if (/心情|壓力|安慰|情緒|無聊/.test(t)) {
    addScore(engine, "emotional_eating", 2);
  }
  if (/放棄|破功|做兩天|堅持不了|整組|一天沒做到/.test(t)) {
    addScore(engine, "consistency", 2);
  }
  if (/知道怎麼|都知道|不是不知道|其實都知道/.test(t)) {
    addScore(engine, "knowledge", -3);
    addScore(engine, "consistency", 1);
    engine.slots.stuck_pattern =
      engine.slots.stuck_pattern.status === "unknown"
        ? { ...engine.slots.stuck_pattern, status: "partial", source: "derived", confidence: 0.5 }
        : engine.slots.stuck_pattern;
    markNotRelevantIfUnknown(engine, "knowledge");
  }
  if (/交女|男朋|自信|穿衣服|外貌|好看|關係/.test(t)) {
    addScore(engine, "motivation_identity", 2);
  }
  if (/體力|好累|睡不|失眠|疲勞|沒力/.test(t)) {
    addScore(engine, "sleep_fatigue", 2);
  }
}

function markNotRelevantIfUnknown(engine: AnalysisEngineState, branch: AnalysisBranchId): void {
  if (branch === "knowledge") {
    engine.branchScores.knowledge = Math.min(engine.branchScores.knowledge, 0);
  }
}

function applyQuizPriors(engine: AnalysisEngineState): void {
  const type = engine.quiz.primaryType;
  if (type === "A") addScore(engine, "emotional_eating", 1);
  if (type === "B") addScore(engine, "motivation_identity", 1);
  if (type === "C") addScore(engine, "consistency", 1);
  if (type === "D") addScore(engine, "knowledge", 1);
  if (type === "E") {
    addScore(engine, "time_work", 1);
    addScore(engine, "meal_rhythm", 1);
  }
  if (type === "F") addScore(engine, "consistency", 1);
}

function applyWhyStuck(engine: AnalysisEngineState, value: string): void {
  if (value === "diet_control") addScore(engine, "emotional_eating", 2);
  if (value === "schedule") {
    addScore(engine, "time_work", 2);
    addScore(engine, "meal_rhythm", 2);
  }
  if (value === "all_or_nothing") addScore(engine, "consistency", 2);
  if (value === "knowledge") addScore(engine, "knowledge", 2);
  if (value === "motivation") addScore(engine, "motivation_identity", 2);
  if (value === "support") addScore(engine, "support", 2);
}

function applyAnswerEffects(
  engine: AnalysisEngineState,
  questionId: string,
  value: unknown,
): void {
  const q = getBankQuestion(questionId);
  if (!q) return;

  markSlot(engine, q.slot, { status: "sufficient", source: "analysis_answer", confidence: 0.9 }, questionId);

  if (questionId === "why_now" && typeof value === "string") {
    classifyWhyNow(value, engine);
  }
  if (questionId === "why_stuck" && typeof value === "string") {
    applyWhyStuck(engine, value);
  }
  if (questionId === "evening_loss_context" && typeof value === "string") {
    if (value === "mood" || value === "bored") addScore(engine, "emotional_eating", 2);
    if (value === "hungry") addScore(engine, "meal_rhythm", 2);
    if (value === "give_up") addScore(engine, "consistency", 1);
  }
  if (questionId === "eating_role" && typeof value === "string") {
    if (value === "comfort" || value === "distract") addScore(engine, "emotional_eating", 2);
    if (value === "give_up") addScore(engine, "consistency", 1);
  }
  if (questionId === "meal_pattern" && typeof value === "string") {
    if (value === "irregular_skip" || value === "night_heavy") addScore(engine, "meal_rhythm", 2);
  }
  if (questionId === "shift_window" && typeof value === "string") {
    addScore(engine, "time_work", 2);
    if (value === "skip_day" || value === "after_work" || value === "late_night") {
      addScore(engine, "meal_rhythm", 1);
    }
  }
  if (questionId === "work_style" && value === "irregular") {
    addScore(engine, "time_work", 2);
  }
  if (questionId === "sleep_hours" && typeof value === "string") {
    if (value === "under_5" || value === "irregular" || value === "5_6") {
      addScore(engine, "sleep_fatigue", 1);
    }
  }
  if (questionId === "failure_response" || questionId === "restart_friction") {
    addScore(engine, "consistency", 1);
    if (value === "alone") addScore(engine, "support", 2);
  }
  if (questionId === "knowledge_gap" && value === "already_know") {
    addScore(engine, "knowledge", -3);
    addScore(engine, "consistency", 2);
  }
  if (questionId === "help_wanted" && (value === "accountability" || value === "habit")) {
    addScore(engine, "support", 1);
  }
  if (questionId === "safety_gate" && value === "yes") {
    addScore(engine, "safety", 3);
    for (const slot of ["eating_pattern", "activity_pattern", "body_context", "sleep_pattern"] as AnalysisSlotId[]) {
      if (engine.slots[slot].status === "unknown") {
        engine.slots[slot] = {
          status: "not_relevant",
          source: "derived",
          confidence: 0.8,
          evidenceQuestionIds: [questionId],
        };
      }
    }
  }
  if (questionId === "trigger_context" && typeof value === "string") {
    if (value === "stress" || value === "craving" || value === "night") addScore(engine, "emotional_eating", 2);
    if (value === "busy_skip") addScore(engine, "meal_rhythm", 2);
  }
}

export function rankedBranches(engine: AnalysisEngineState): AnalysisBranchId[] {
  return [...ANALYSIS_BRANCH_IDS]
    .filter((id) => id !== "safety")
    .sort((a, b) => (engine.branchScores[b] ?? 0) - (engine.branchScores[a] ?? 0));
}

export function primaryBranch(engine: AnalysisEngineState): AnalysisBranchId | null {
  const ranked = rankedBranches(engine).filter((id) => (engine.branchScores[id] ?? 0) >= ENTRY_THRESHOLD);
  return ranked[0] ?? null;
}

function branchEntered(engine: AnalysisEngineState, id: AnalysisBranchId): boolean {
  return (engine.branchScores[id] ?? 0) >= ENTRY_THRESHOLD;
}

function askedSet(engine: AnalysisEngineState): Set<string> {
  return new Set(engine.askedQuestionIds);
}

function nextProbeForBranch(engine: AnalysisEngineState, branch: AnalysisBranchId): string | null {
  const spec = BRANCH_PROBE_QUESTIONS[branch];
  const asked = askedSet(engine);
  let depth = 0;
  for (const id of spec.questionIds) {
    if (asked.has(id)) {
      depth += 1;
      continue;
    }
    if (depth >= spec.maxDepth) return null;
    if (branch === "knowledge" && (engine.branchScores.knowledge ?? 0) <= 0) return null;
    if (branch === "body_context") {
      const goal = engine.quiz.primaryGoal;
      const answeredGoal = true;
      void answeredGoal;
      if (goal !== "weight" && goal !== "body_fat") return null;
      if (rankedBranches(engine)[0] !== "body_context") return null;
    }
    if (branch === "emotional_eating" && asked.has("trigger_context") && id === "evening_loss_context") {
      continue;
    }
    if (branch === "emotional_eating" && id === "eating_role") {
      const answersNeedRole = true;
      void answersNeedRole;
    }
    return id;
  }
  return null;
}

function eatingRoleNeeded(engine: AnalysisEngineState, answers: AnalysisIntakeAnswers): boolean {
  const evening = answers.evening_loss_context;
  return evening === "mood" || evening === "bored" || evening === "reward";
}

function missingFrontSlot(engine: AnalysisEngineState): AnalysisSlotId | null {
  for (const slot of ANALYSIS_FRONT_REQUIRED_SLOTS) {
    if (engine.slots[slot].status !== "sufficient") return slot;
  }
  return null;
}

function missingBackSlot(engine: AnalysisEngineState): AnalysisSlotId | null {
  for (const slot of ANALYSIS_BACK_REQUIRED_SLOTS) {
    if (engine.slots[slot].status !== "sufficient") return slot;
  }
  return null;
}

function remainingReserved(engine: AnalysisEngineState): number {
  return ANALYSIS_BACK_REQUIRED_SLOTS.filter((s) => engine.slots[s].status !== "sufficient").length;
}

function emitReflection(
  engine: AnalysisEngineState,
  reflection: AnalysisReflection,
): AnalysisReflection | null {
  if (engine.reflections.some((r) => r.templateId === reflection.templateId)) return null;
  return reflection;
}

function optionLabel(questionId: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const q = getBankQuestion(questionId);
  return q?.options?.find((o) => o.id === value)?.label ?? null;
}

function buildReflection(
  engine: AnalysisEngineState,
  justAskedId: string,
  answers: AnalysisIntakeAnswers,
  nextQuestionId: string | null,
): AnalysisReflection | null {
  const whyNow = typeof answers.why_now === "string" ? answers.why_now : "";
  const stuckLabel = optionLabel("why_stuck", answers.why_stuck);
  const goalLabel = optionLabel("goal_focus", answers.goal_focus);

  if (justAskedId === "why_stuck" && stuckLabel && whyNow) {
    if (/交女|男朋|自信|穿衣服|外貌|好看|關係/.test(whyNow) || answers.goal_focus === "clothes" || answers.goal_focus === "shape") {
      const stuckBit = stuckLabel.replace(/？/g, "");
      return {
        id: `ref_${engine.reflections.length + 1}_identity`,
        templateId: "identity_and_stuck",
        kicker: "我大概抓到一個方向了。",
        text: `你想改變的不只是體重，而是希望自己更有自信。你又提到${stuckBit}，我想先把這件事弄清楚。`,
        evidence: [whyNow, stuckLabel, goalLabel].filter((x): x is string => Boolean(x)),
      };
    }
    if (answers.why_stuck === "all_or_nothing" || /知道怎麼|都知道|放棄|破功/.test(whyNow)) {
      const know = /知道怎麼|都知道|不是不知道/.test(whyNow);
      return {
        id: `ref_${engine.reflections.length + 1}_consistency`,
        templateId: "consistency_restart",
        kicker: "我大概抓到一個方向了。",
        text: know
          ? "你不是不知道方法，而是破功之後很難再接回來。"
          : "一次沒做到就容易整組放棄，這件事比再找新方法更關鍵。",
        evidence: [whyNow, stuckLabel].filter((x): x is string => Boolean(x)),
      };
    }
    if (answers.why_stuck === "schedule") {
      return {
        id: `ref_${engine.reflections.length + 1}_schedule`,
        templateId: "schedule_open",
        kicker: "我想再確認一件事。",
        text: "你提到作息或時間讓你很難持續，我想先弄清楚生活節奏怎麼把飲食打亂。",
        evidence: [stuckLabel],
      };
    }
  }

  if (justAskedId === "evening_loss_context") {
    const label = optionLabel("evening_loss_context", answers.evening_loss_context);
    if (answers.evening_loss_context === "mood" || answers.evening_loss_context === "bored") {
      return {
        id: `ref_${engine.reflections.length + 1}_emotional`,
        templateId: "emotional_not_hunger",
        kicker: "這個很關鍵。",
        text: "這個很重要。對你來說，吃東西可能不只是肚子餓。",
        evidence: label ? [label] : [],
      };
    }
    if (answers.evening_loss_context === "hungry") {
      return {
        id: `ref_${engine.reflections.length + 1}_hungry`,
        templateId: "hunger_rhythm",
        kicker: "這個很關鍵。",
        text: "這比較像餓太久之後的反彈，我想再對一下你平常怎麼吃飯。",
        evidence: label ? [label] : [],
      };
    }
  }

  if (justAskedId === "eating_role") {
    const label = optionLabel("eating_role", answers.eating_role);
    if (answers.eating_role === "comfort" || answers.eating_role === "distract") {
      return {
        id: `ref_${engine.reflections.length + 1}_role`,
        templateId: "emotional_not_hunger",
        kicker: "這個很關鍵。",
        text: "這個很重要。對你來說，吃東西可能不只是肚子餓。",
        evidence: label ? [label] : [],
      };
    }
  }

  if (justAskedId === "meal_pattern") {
    const meal = optionLabel("meal_pattern", answers.meal_pattern);
    const stuck = optionLabel("why_stuck", answers.why_stuck);
    if (
      (answers.meal_pattern === "irregular_skip" || answers.meal_pattern === "night_heavy") &&
      (answers.why_stuck === "schedule" || branchEntered(engine, "time_work"))
    ) {
      return {
        id: `ref_${engine.reflections.length + 1}_rhythm`,
        templateId: "life_rhythm",
        kicker: "我想再確認一件事。",
        text: "你的問題看起來比較不像不知道怎麼吃，而是生活時間讓飲食很難穩定。",
        evidence: [meal, stuck].filter((x): x is string => Boolean(x)),
      };
    }
  }

  void nextQuestionId;
  return null;
}

function nextBranchProbe(engine: AnalysisEngineState, answers: AnalysisIntakeAnswers): string | null {
  const asked = askedSet(engine);
  for (const branch of rankedBranches(engine)) {
    if (!branchEntered(engine, branch)) continue;
    if (branch === "emotional_eating" && asked.has("evening_loss_context") && !asked.has("eating_role")) {
      if (eatingRoleNeeded(engine, answers)) return "eating_role";
      continue;
    }
    const probe = nextProbeForBranch(engine, branch);
    if (probe) return probe;
  }
  return null;
}

function readyToComplete(engine: AnalysisEngineState, hasProbe: boolean): boolean {
  if (missingFrontSlot(engine) || missingBackSlot(engine)) return false;
  const count = engine.askedQuestionIds.length;
  if (count < ANALYSIS_STOP.min) return false;
  if (count >= ANALYSIS_STOP.hardMax) return true;
  if (count >= ANALYSIS_STOP.targetMax && !hasProbe) return true;
  if (count >= ANALYSIS_STOP.targetMin && !hasProbe) return true;
  if (count >= ANALYSIS_STOP.targetMax) return true;
  return false;
}

export function selectNextAnalysisStep(
  engine: AnalysisEngineState,
  answers: AnalysisIntakeAnswers,
): AnalysisNextStep {
  const count = engine.askedQuestionIds.length;
  const asked = askedSet(engine);

  const front = missingFrontSlot(engine);
  if (front) {
    const questionId = FRONT_REQUIRED_QUESTION[front as keyof typeof FRONT_REQUIRED_QUESTION];
    return { kind: "question", questionId, reflection: engine.lastReflection };
  }

  const reserved = remainingReserved(engine);
  const probeBudget = ANALYSIS_STOP.hardMax - count - reserved;
  const canProbe = probeBudget > 0 && count < ANALYSIS_STOP.targetMax;

  let probe: string | null = null;
  if (canProbe) {
    probe = nextBranchProbe(engine, answers);
    if (probe && asked.has(probe)) probe = null;
  }

  const supportNeeded =
    branchEntered(engine, "support") ||
    branchEntered(engine, "consistency") ||
    branchEntered(engine, "emotional_eating");
  if (
    canProbe &&
    !probe &&
    engine.slots.support_preference.status === "unknown" &&
    supportNeeded &&
    !asked.has("help_wanted") &&
    count + reserved < ANALYSIS_STOP.targetMax
  ) {
    probe = "help_wanted";
  }

  if (probe && count + 1 + reserved <= ANALYSIS_STOP.hardMax) {
    return { kind: "question", questionId: probe, reflection: engine.lastReflection };
  }

  if (engine.slots.commitment.status !== "sufficient" && !asked.has("commitment")) {
    return { kind: "question", questionId: BACK_REQUIRED_QUESTION.commitment, reflection: engine.lastReflection };
  }

  if (engine.slots.safety.status !== "sufficient" && !asked.has("safety_gate")) {
    return { kind: "question", questionId: BACK_REQUIRED_QUESTION.safety, reflection: engine.lastReflection };
  }

  const stillProbe = nextBranchProbe(engine, answers);
  if (count >= ANALYSIS_STOP.hardMax) {
    return { kind: "complete", reason: "hard_max", reflection: null };
  }
  if (readyToComplete(engine, Boolean(stillProbe && count < ANALYSIS_STOP.targetMax))) {
    const reason =
      answers.safety_gate === "yes" && engine.slots.safety.status === "sufficient" ? "safety_stop" : "sufficient";
    return { kind: "complete", reason, reflection: null };
  }

  if (stillProbe && count + reserved < ANALYSIS_STOP.hardMax) {
    return { kind: "question", questionId: stillProbe, reflection: engine.lastReflection };
  }

  if (engine.slots.safety.status !== "sufficient") {
    return { kind: "question", questionId: "safety_gate", reflection: engine.lastReflection };
  }

  if (count < ANALYSIS_STOP.min) {
    const fillers = ["help_wanted", "meal_pattern", "sleep_hours"];
    const fill = fillers.find((id) => !asked.has(id));
    if (fill) {
      return { kind: "question", questionId: fill, reflection: engine.lastReflection };
    }
  }

  return {
    kind: "complete",
    reason: count >= ANALYSIS_STOP.hardMax ? "hard_max" : "sufficient",
    reflection: null,
  };
}

export function applyAnalysisAnswer(input: {
  engine: AnalysisEngineState;
  answers: AnalysisIntakeAnswers;
  questionId: string;
  value: unknown;
}): { engine: AnalysisEngineState; answers: AnalysisIntakeAnswers; next: AnalysisNextStep } {
  const question = resolveAnalysisQuestion(input.questionId);
  if (!question) {
    throw new Error(`unknown_question:${input.questionId}`);
  }
  const validationError = validateAnswerForQuestion(question, input.value);
  if (validationError) {
    throw new Error(`invalid_answer:${validationError}`);
  }

  const engine: AnalysisEngineState = structuredClone(input.engine);

  const answers = {
    ...input.answers,
    [input.questionId]:
      question.type === "number_pair"
        ? {
            height_cm: Number((input.value as { height_cm: number }).height_cm),
            weight_kg: Number((input.value as { weight_kg: number }).weight_kg),
          }
        : question.type === "scale"
          ? Number(input.value)
          : question.type === "free_text"
            ? String(input.value).trim()
            : question.type === "multi"
              ? (input.value as string[])
              : input.value,
  } as AnalysisIntakeAnswers;

  if (!engine.askedQuestionIds.includes(input.questionId)) {
    engine.askedQuestionIds = [...engine.askedQuestionIds, input.questionId];
  }
  applyAnswerEffects(engine, input.questionId, answers[input.questionId as keyof AnalysisIntakeAnswers]);

  engine.lastReflection = null;
  const next = selectNextAnalysisStep(engine, answers);
  const candidate =
    next.kind === "question" ? buildReflection(engine, input.questionId, answers, next.questionId) : null;
  const reflection = candidate ? emitReflection(engine, candidate) : null;
  if (reflection) {
    engine.reflections = [...engine.reflections, reflection];
    engine.lastReflection = reflection;
    if (next.kind === "question") next.reflection = reflection;
  }
  engine.currentQuestionId = next.kind === "question" ? next.questionId : null;
  engine.completionReason = next.kind === "complete" ? next.reason : null;
  return { engine, answers, next };
}

export function startDynamicIntake(quiz: AnalysisQuizSignals): {
  engine: AnalysisEngineState;
  answers: AnalysisIntakeAnswers;
  next: AnalysisNextStep;
} {
  const engine = createInitialEngine(quiz);
  const answers: AnalysisIntakeAnswers = {};
  const next = selectNextAnalysisStep(engine, answers);
  engine.currentQuestionId = next.kind === "question" ? next.questionId : null;
  engine.lastReflection = null;
  return { engine, answers, next };
}

export function answersEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hydrateEngineFromPersisted(input: {
  answersJson: Record<string, unknown> | null;
  currentQuestionId: string | null;
  quiz: AnalysisQuizSignals;
  analysisState: string;
}): { engine: AnalysisEngineState; answers: AnalysisIntakeAnswers; legacy: boolean } {
  const answers = stripEngineMeta(input.answersJson);
  const existing = readEngineFromAnswers(input.answersJson);
  const completed =
    input.analysisState === "basic_report_ready" ||
    input.analysisState === "ai_generating" ||
    input.analysisState === "ai_ready" ||
    input.analysisState === "ai_failed" ||
    input.analysisState === "questions_completed";

  if (existing) {
    const engine = structuredClone(existing);
    if (!engine.currentQuestionId && input.currentQuestionId && !completed) {
      engine.currentQuestionId = input.currentQuestionId;
    }
    return { engine, answers, legacy: false };
  }

  const engine = createInitialEngine(input.quiz);
  const answeredIds = LEGACY_LINEAR_QUESTION_IDS.filter((id) => {
    const value = (answers as Record<string, unknown>)[id];
    return value !== undefined && value !== null && value !== "";
  });
  for (const id of answeredIds) {
    if (!engine.askedQuestionIds.includes(id)) engine.askedQuestionIds.push(id);
    applyAnswerEffects(engine, id, (answers as Record<string, unknown>)[id]);
  }
  engine.currentQuestionId = completed ? null : input.currentQuestionId;
  if (completed) {
    engine.completionReason = "sufficient";
    if (engine.slots.safety.status !== "sufficient" && answers.safety_gate) {
      markSlot(engine, "safety", { status: "sufficient", source: "analysis_answer", confidence: 0.9 }, "safety_gate");
    }
  }
  return { engine, answers, legacy: true };
}

export function resolveDynamicMilestones(input: {
  engine: AnalysisEngineState;
  analysisState: string;
  hasLayer1: boolean;
}): AnalysisMilestone[] {
  const goalDone = slotSufficient(input.engine.slots.goal) && slotSufficient(input.engine.slots.motivation);
  const stuckDone = slotSufficient(input.engine.slots.stuck_pattern);
  const rhythmDone =
    slotSufficient(input.engine.slots.eating_pattern) ||
    slotSufficient(input.engine.slots.life_context) ||
    slotSufficient(input.engine.slots.trigger_pattern) ||
    slotSufficient(input.engine.slots.sleep_pattern) ||
    Boolean(input.engine.completionReason);
  const state = input.analysisState;
  const reportDone = state === "ai_ready";
  const reportFailed = state === "ai_failed";
  const reportActive =
    state === "ai_generating" || state === "basic_report_ready" || (input.hasLayer1 && !reportDone && !reportFailed);
  const inQuestions = state === "questions_in_progress" || state === "shell";

  const reportLabel = reportFailed
    ? "個人分析暫時無法完成（基本整理仍可看）"
    : reportDone
      ? "個人分析已完成"
      : reportActive
        ? "正在產生你的個人分析"
        : "整理你的分析";

  return [
    {
      id: "goal",
      label: "了解你的目標",
      done: goalDone || input.hasLayer1,
      active: inQuestions && !goalDone,
    },
    {
      id: "stuck",
      label: "找出真正卡住的地方",
      done: stuckDone || input.hasLayer1,
      active: inQuestions && goalDone && !stuckDone,
    },
    {
      id: "rhythm",
      label: "看看生活節奏",
      done: (rhythmDone && stuckDone) || input.hasLayer1,
      active: inQuestions && stuckDone && !rhythmDone && !input.hasLayer1,
    },
    {
      id: "report",
      label: reportLabel,
      done: reportDone,
      active: reportActive && !reportDone && !reportFailed,
    },
  ];
}

export function simulateAnalysisPath(input: {
  quiz: AnalysisQuizSignals;
  intent: Record<string, unknown>;
}): {
  questionIds: string[];
  reflections: AnalysisReflection[];
  completionReason: AnalysisEngineState["completionReason"];
  engine: AnalysisEngineState;
  answers: AnalysisIntakeAnswers;
} {
  let { engine, answers, next } = startDynamicIntake(input.quiz);
  const questionIds: string[] = [];
  const reflections: AnalysisReflection[] = [];
  let guard = 0;
  while (next.kind === "question" && guard < 20) {
    guard += 1;
    const id = next.questionId;
    if (questionIds.includes(id)) break;
    questionIds.push(id);
    if (next.reflection) reflections.push(next.reflection);
    const value = input.intent[id];
    if (value === undefined) {
      throw new Error(`simulate_missing_intent:${id}`);
    }
    const applied = applyAnalysisAnswer({ engine, answers, questionId: id, value });
    engine = applied.engine;
    answers = applied.answers;
    next = applied.next;
  }
  return {
    questionIds,
    reflections: engine.reflections,
    completionReason: engine.completionReason,
    engine,
    answers,
  };
}

export function dynamicContextForReport(engine: AnalysisEngineState, answers: AnalysisIntakeAnswers): {
  primaryBranch: AnalysisBranchId | null;
  completedSlots: AnalysisSlotId[];
  activeBranches: AnalysisBranchId[];
  reflections: Array<{ text: string; evidence: string[] }>;
  derivedFacts: Array<{ fact: string; inference: true; evidence: string[] }>;
} {
  const completedSlots = ANALYSIS_SLOT_IDS.filter((id) => slotSufficient(engine.slots[id]));
  const activeBranches = rankedBranches(engine).filter((id) => branchEntered(engine, id));
  const derivedFacts: Array<{ fact: string; inference: true; evidence: string[] }> = [];
  for (const ref of engine.reflections) {
    derivedFacts.push({ fact: ref.text, inference: true, evidence: ref.evidence });
  }
  void answers;
  return {
    primaryBranch: primaryBranch(engine),
    completedSlots,
    activeBranches,
    reflections: engine.reflections.map((r) => ({ text: r.text, evidence: r.evidence })),
    derivedFacts,
  };
}

export { resolveAnalysisQuestion, getBankQuestion, validateAnswerForQuestion };
