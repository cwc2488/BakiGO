import { createHash } from "node:crypto";
import {
  DYNAMIC_QUIZ_BOUNDS,
  DYNAMIC_QUIZ_META_KEY,
  DYNAMIC_QUIZ_SCHEMA_VERSION,
  compactQuizHistory,
  createInitialDynamicQuiz,
  emptyHypothesisSeq,
  quizClaim,
  type DynamicQuizAsked,
  type DynamicQuizState,
  type QuizPrior,
  type QuizTurnOutput,
} from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";
import { interpretQuizAnimalPayoff } from "@/lib/analysis/dynamic-quiz/quiz-animal-payoff";
import { generateDynamicQuizTurn } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-provider";
import {
  diffHypothesisLifecycle,
  ensureQuizPriorHypotheses,
  stabilizeQuizPrior,
} from "@/lib/analysis/dynamic-quiz/quiz-prior-lifecycle";
import {
  publicOptionsOnly,
  validateQuizTurn,
} from "@/lib/analysis/dynamic-quiz/dynamic-quiz-validate";

export function isDynamicQuizSession(raw: Record<string, unknown> | null | undefined): boolean {
  const meta = raw?.[DYNAMIC_QUIZ_META_KEY];
  return Boolean(
    meta && typeof meta === "object" && (meta as { version?: string }).version === DYNAMIC_QUIZ_SCHEMA_VERSION,
  );
}

export function readDynamicQuiz(raw: Record<string, unknown> | null | undefined): DynamicQuizState | null {
  if (!isDynamicQuizSession(raw)) return null;
  const state = raw![DYNAMIC_QUIZ_META_KEY] as DynamicQuizState;
  return {
    ...state,
    lifecycleLog: state.lifecycleLog ?? [],
    correctionEvents: state.correctionEvents ?? [],
    hypothesisSeq: state.hypothesisSeq ?? emptyHypothesisSeq(),
    judgeLog: state.judgeLog ?? [],
    usage: {
      promptTokens: state.usage?.promptTokens ?? 0,
      outputTokens: state.usage?.outputTokens ?? 0,
      regenerations: state.usage?.regenerations ?? 0,
      openaiMs: state.usage?.openaiMs ?? [],
      serverMs: state.usage?.serverMs ?? [],
      judgePromptTokens: state.usage?.judgePromptTokens ?? 0,
      judgeOutputTokens: state.usage?.judgeOutputTokens ?? 0,
      judgeMs: state.usage?.judgeMs ?? [],
    },
  };
}

export function packDynamicQuiz(
  answers: Record<string, unknown>,
  quiz: DynamicQuizState,
): Record<string, unknown> {
  return { ...answers, [DYNAMIC_QUIZ_META_KEY]: quiz };
}

function fingerprint(questionId: string, value: unknown): string {
  return createHash("sha256").update(`${questionId}::${JSON.stringify(value)}`).digest("hex");
}

function selectedFromValue(
  current: NonNullable<DynamicQuizState["currentQuestion"]>,
  value: unknown,
): { ids: string[]; labels: string[] } {
  const ids = Array.isArray(value)
    ? value.map((v) => String(v))
    : typeof value === "string"
      ? [value]
      : [];
  if (!ids.length) throw new Error("invalid_answer:請選一個選項。");
  if (current.type === "single_choice" && ids.length !== 1) {
    throw new Error("invalid_answer:這題請選一個。");
  }
  const labels: string[] = [];
  for (const id of ids) {
    const opt = current.options.find((o) => o.id === id);
    if (!opt) throw new Error("invalid_answer:選項不存在。");
    labels.push(opt.label);
  }
  return { ids, labels };
}

function applyGeneratedQuestion(
  state: DynamicQuizState,
  output: QuizTurnOutput,
  nextId: string,
): DynamicQuizState {
  const stabilized = stabilizeQuizPrior(
    { ...output.quiz_prior, unverified: true },
    state.prior,
    state.hypothesisSeq ?? emptyHypothesisSeq(),
  );
  const prior = stabilized.prior;
  const lifecycleLog = [
    ...(state.lifecycleLog ?? []),
    ...diffHypothesisLifecycle(state.prior, prior, "quiz_answer", output.reasoning_tag || "quiz_turn"),
  ];
  if (output.action === "complete" || output.decision === "complete") {
    return {
      ...state,
      status: "complete",
      currentQuestion: null,
      understanding: output.understanding,
      prior,
      hypothesisSeq: stabilized.seq,
      lifecycleLog,
    };
  }
  const options = publicOptionsOnly(output.options).slice(0, 6);
  return {
    ...state,
    understanding: output.understanding,
    prior,
    hypothesisSeq: stabilized.seq,
    lifecycleLog,
    currentQuestion: {
      id: nextId,
      question: output.question.trim(),
      type: output.type,
      options,
      reasoning_tag: output.reasoning_tag,
      hypothesis_targets: output.hypothesis_targets,
      whyNextQuestion: output.why_next_question.trim(),
      informationGain: output.information_gain ?? null,
    },
  };
}

function fallbackComplete(state: DynamicQuizState, latest: string[]): QuizPrior {
  const motivation = quizClaim(latest[0] || "想改變體態", "low", latest, "motivation", "mot_1");
  return ensureQuizPriorHypotheses({
    unverified: true,
    likely_primary_motivation: motivation,
    likely_barriers: [],
    possible_tradeoffs: [],
    possible_behavior_pattern: [],
    confidence: { overall: "low", motivation: "low", barrier: "low" },
    contradictions: state.understanding.contradictions,
    unresolved: state.understanding.unresolved_hypotheses,
    evidence: compactQuizHistory(state).map((h) => `${h.question} → ${h.selected.join("、")}`),
    hypotheses: [motivation],
  });
}

function completeWithPrior(
  state: DynamicQuizState,
  output: QuizTurnOutput | null,
  latest: string[],
  extraServerMs: number,
): DynamicQuizState {
  const rawPrior = output?.quiz_prior
    ? { ...output.quiz_prior, unverified: true as const }
    : fallbackComplete(state, latest);
  const stabilized = stabilizeQuizPrior(rawPrior, state.prior, state.hypothesisSeq ?? emptyHypothesisSeq());
  const payoffAnimal = interpretQuizAnimalPayoff({
    prior: stabilized.prior,
    history: compactQuizHistory({ ...state, prior: stabilized.prior }),
  });
  return {
    ...state,
    status: "complete",
    currentQuestion: null,
    understanding: output?.understanding ?? state.understanding,
    prior: stabilized.prior,
    hypothesisSeq: stabilized.seq,
    payoffAnimal,
    lifecycleLog: [
      ...(state.lifecycleLog ?? []),
      ...diffHypothesisLifecycle(state.prior, stabilized.prior, "quiz_answer", "complete"),
    ],
    usage: {
      promptTokens: state.usage.promptTokens ?? 0,
      outputTokens: state.usage.outputTokens ?? 0,
      regenerations: state.usage.regenerations ?? 0,
      openaiMs: state.usage.openaiMs ?? [],
      serverMs: [...(state.usage.serverMs ?? []), extraServerMs],
      judgePromptTokens: state.usage.judgePromptTokens ?? 0,
      judgeOutputTokens: state.usage.judgeOutputTokens ?? 0,
      judgeMs: state.usage.judgeMs ?? [],
    },
  };
}

function fallbackAskOutput(state: DynamicQuizState, latest: string[]): QuizTurnOutput {
  return {
    action: "ask",
    decision: "continue",
    why_next_question: "在達到最低題數前，分辨準備度",
    last_answer_added: latest.join("、"),
    remaining_uncertainty: "準備度仍不清楚",
    material_change_targets: ["readiness"],
    information_gain: {
      target: "準備度",
      plausible_answers: ["還不確定從哪開始", "其實沒有很急", "知道卡點但還沒做"],
      material_change: true,
      change_dimensions: ["readiness"],
      short_rationale: "不同準備度會改變下一步",
    },
    question: "就你剛剛選的來看，現在最接近你的是哪一種？",
    type: "single_choice",
    options: [
      { id: "f1", label: "我想改變，但還不確定從哪裡開始" },
      { id: "f2", label: "其實沒有很急" },
      { id: "f3", label: "我知道卡在哪，只是還沒做" },
      { id: "f4", label: "試過，可是沒持續" },
    ],
    reasoning_tag: "fallback_safe",
    hypothesis_targets: ["readiness"],
    understanding: state.understanding,
    quiz_prior: fallbackComplete(state, latest),
  };
}

function isUnsafeAsk(violations: string[]): boolean {
  return (
    violations.includes("medical_overreach") ||
    violations.includes("exposed_model") ||
    violations.includes("jargon_options") ||
    violations.includes("repeated_meaning")
  );
}

export async function processDynamicQuizAnswer(input: {
  state: DynamicQuizState;
  questionId: string;
  value: unknown;
  icebreaker: {
    animalName: string;
    tagline: string;
    coreInsight: string;
    source?: "personality_quiz" | "native_opener";
  };
}): Promise<{
  state: DynamicQuizState;
  complete: boolean;
  usedFallback: boolean;
}> {
  if (!input.state.currentQuestion) {
    return { state: input.state, complete: input.state.status === "complete", usedFallback: false };
  }
  if (input.questionId !== input.state.currentQuestion.id) {
    throw new Error("question_mismatch");
  }
  const fp = fingerprint(input.questionId, input.value);
  if (input.state.lastFingerprint === fp) {
    return { state: input.state, complete: input.state.status === "complete", usedFallback: false };
  }

  const selected = selectedFromValue(input.state.currentQuestion, input.value);
  const askedRow: DynamicQuizAsked = {
    id: input.state.currentQuestion.id,
    question: input.state.currentQuestion.question,
    type: input.state.currentQuestion.type,
    options: input.state.currentQuestion.options,
    selectedIds: selected.ids,
    selectedLabels: selected.labels,
    reasoning_tag: input.state.currentQuestion.reasoning_tag,
    hypothesis_targets: input.state.currentQuestion.hypothesis_targets,
    whyNextQuestion: input.state.currentQuestion.whyNextQuestion ?? "",
    informationGain: input.state.currentQuestion.informationGain ?? null,
  };
  let state: DynamicQuizState = {
    ...input.state,
    asked: [...input.state.asked, askedRow],
    lastFingerprint: fp,
    currentQuestion: null,
    lifecycleLog: input.state.lifecycleLog ?? [],
    judgeLog: input.state.judgeLog ?? [],
    usage: {
      promptTokens: input.state.usage?.promptTokens ?? 0,
      outputTokens: input.state.usage?.outputTokens ?? 0,
      regenerations: input.state.usage?.regenerations ?? 0,
      openaiMs: input.state.usage?.openaiMs ?? [],
      serverMs: input.state.usage?.serverMs ?? [],
      judgePromptTokens: input.state.usage?.judgePromptTokens ?? 0,
      judgeOutputTokens: input.state.usage?.judgeOutputTokens ?? 0,
      judgeMs: input.state.usage?.judgeMs ?? [],
    },
  };

  let usedFallback = false;
  let output: QuizTurnOutput | null = null;
  let lastViolations: string[] = [];
  const wall = Date.now();

  try {
    const generated = await generateDynamicQuizTurn({
      state,
      icebreaker: input.icebreaker,
      latestSelected: selected.labels,
    });
    output = generated.output;
    state = {
      ...state,
      usage: {
        ...state.usage,
        promptTokens: state.usage.promptTokens + generated.inputTokens,
        outputTokens: state.usage.outputTokens + generated.outputTokens,
        openaiMs: [...state.usage.openaiMs, generated.openaiMs],
        serverMs: [...state.usage.serverMs, generated.latencyMs],
      },
    };
    const validation = validateQuizTurn({
      output,
      previousQuestions: state.asked.map((q) => q.question),
      previousAsked: state.asked,
      answeredCount: state.asked.length,
      min: DYNAMIC_QUIZ_BOUNDS.min,
    });
    lastViolations = validation.violations;
    const hard = lastViolations.filter(
      (v) => v !== "no_information_gain" && v !== "low_information" && v !== "decision_mismatch",
    );
    if (hard.length) {
      const originalQuestion = output.question;
      const originalOptions = output.options.map((o) => o.label);
      try {
        const repaired = await generateDynamicQuizTurn({
          state,
          icebreaker: input.icebreaker,
          latestSelected: selected.labels,
          repair: {
            violations: hard,
            note: hard.includes("repeated_meaning")
              ? "Same information target was already asked. Do not paraphrase it. Ask a different target, or complete."
              : "只修正這些硬約束。不要改寫成問卷模板。不要發明診斷。選項保持口語。",
          },
        });
        output = repaired.output;
        state = {
          ...state,
          usage: {
            ...state.usage,
            promptTokens: state.usage.promptTokens + repaired.inputTokens,
            outputTokens: state.usage.outputTokens + repaired.outputTokens,
            regenerations: state.usage.regenerations + 1,
            openaiMs: [...state.usage.openaiMs, repaired.openaiMs],
            serverMs: [...state.usage.serverMs, repaired.latencyMs],
          },
          violationLog: [
            ...state.violationLog,
            {
              originalQuestion,
              originalOptions,
              violations: hard,
              regeneratedQuestion: repaired.output.question,
              finalQuestion: repaired.output.question,
              reason: hard.join(","),
            },
          ],
        };
        lastViolations = validateQuizTurn({
          output,
          previousQuestions: state.asked.map((q) => q.question),
          previousAsked: state.asked,
          answeredCount: state.asked.length,
          min: DYNAMIC_QUIZ_BOUNDS.min,
        }).violations;
      } catch {
        state = {
          ...state,
          violationLog: [
            ...state.violationLog,
            {
              originalQuestion,
              originalOptions,
              violations: hard,
              regeneratedQuestion: null,
              finalQuestion: output.question,
              reason: `${hard.join(",")}|regen_failed`,
            },
          ],
        };
      }
    }
  } catch {
    usedFallback = true;
  }

  // Product stopping: min 6; generator may complete at 6–7; hard cap 8 never generates Q9.
  // Independent Judge is experiment-only and is not called on this path.
  if (state.asked.length >= DYNAMIC_QUIZ_BOUNDS.hardMax) {
    return {
      state: completeWithPrior(state, output, selected.labels, Date.now() - wall),
      complete: true,
      usedFallback,
    };
  }

  const generatorComplete = Boolean(
    output && (output.action === "complete" || output.decision === "complete"),
  );
  if (generatorComplete && state.asked.length >= DYNAMIC_QUIZ_BOUNDS.min) {
    return {
      state: completeWithPrior(state, output, selected.labels, Date.now() - wall),
      complete: true,
      usedFallback,
    };
  }

  if (output && isUnsafeAsk(lastViolations)) {
    if (state.asked.length >= DYNAMIC_QUIZ_BOUNDS.min) {
      return {
        state: completeWithPrior(state, output, selected.labels, Date.now() - wall),
        complete: true,
        usedFallback,
      };
    }
    usedFallback = true;
    output = null;
  }

  if (!output || output.action !== "ask" || !output.question.trim()) {
    if (state.asked.length >= DYNAMIC_QUIZ_BOUNDS.min) {
      return {
        state: completeWithPrior(state, output, selected.labels, Date.now() - wall),
        complete: true,
        usedFallback: true,
      };
    }
    usedFallback = true;
    output = fallbackAskOutput(state, selected.labels);
  }

  const nextId = `dq_q${state.asked.length + 1}`;
  state = applyGeneratedQuestion(state, output, nextId);
  return { state, complete: false, usedFallback };
}

export { createInitialDynamicQuiz, compactQuizHistory };
