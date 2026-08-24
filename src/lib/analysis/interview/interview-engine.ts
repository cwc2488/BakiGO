import { createHash } from "node:crypto";
import {
  ANALYSIS_INTERVIEW_BOUNDS,
  ANALYSIS_INTERVIEW_MAX_ATTEMPTS,
  ANALYSIS_INTERVIEW_META_KEY,
  ANALYSIS_INTERVIEW_SCHEMA_VERSION,
  INTERVIEW_OPENER_ID,
  INTERVIEW_OPENER_QUESTION,
  INTERVIEW_SAFETY_QUESTION,
  INTERVIEW_SAFETY_QUESTION_ID,
  blankTurnOutput,
  type ConversionSignalType,
  type InterviewAiTurn,
  type InterviewSessionState,
  type InterviewTurn,
} from "@/lib/analysis/interview/interview-contract";
import {
  extractDeterministicFacts,
  groundPatches,
  maybeConfirmHypothesis,
  maybeProposeHypothesis,
  patchesToPartial,
  factGroundedInText,
} from "@/lib/analysis/interview/interview-grounding";
import { detectProgrammaticSafety, detectUserQuestionType } from "@/lib/analysis/interview/interview-fixture";
import { generateInterviewTurn } from "@/lib/analysis/interview/interview-provider";
import {
  applyInformationGain,
  assessSufficiency,
  evaluateSteering,
  looksLikeTrialWillingness,
  namedHighValueGap,
  needsSafetyBoundary,
  purposeForGap,
  semanticEnough,
  shouldBypassInterviewLlm,
  shouldCompleteImmediately,
  userQuestionKind,
  type SteeringDecision,
} from "@/lib/analysis/interview/interview-quality";
import {
  interviewActivePresentation,
  isInterviewChallenge,
  isOthersMarrying,
  isSelfWeddingIntent,
  usefulUnderstandingReady,
} from "@/lib/analysis/interview/interview-reasoner";
import {
  evaluateQuestionCoherence,
  slotCoercionRejects,
  whyThisQuestionNow,
  evaluateAnswerNovelty,
  detectSemanticPivot,
  type QuestionCoherence,
} from "@/lib/analysis/interview/interview-coherence";
import {
  buildCurrentHumanModel,
  type CurrentHumanModel,
} from "@/lib/analysis/interview/interview-human-model";
import {
  applyProgramHardStop,
  followUpText,
  validateConversationTurn,
  type ConversationValidation,
} from "@/lib/analysis/interview/interview-validate";
import {
  emptyUnderstandingState,
  isKnown,
  mergeUnderstanding,
  publicUnderstandingSummary,
  type UnderstandingState,
} from "@/lib/analysis/interview/understanding-state";
import type { AnalysisIntakeAnswers, AnalysisQuestionDef } from "@/lib/analysis/analysis-questions";
import type { AnalysisAiInputSnapshot } from "@/lib/analysis/analysis-ai-schema";

export { semanticEnough, assessSufficiency, namedHighValueGap, shouldBypassInterviewLlm, evaluateQuestionCoherence };

export function isInterviewSession(raw: Record<string, unknown> | null | undefined): boolean {
  const meta = raw?.[ANALYSIS_INTERVIEW_META_KEY];
  return Boolean(
    meta && typeof meta === "object" && (meta as { version?: string }).version === ANALYSIS_INTERVIEW_SCHEMA_VERSION,
  );
}

export function readInterview(raw: Record<string, unknown> | null | undefined): InterviewSessionState | null {
  if (!isInterviewSession(raw)) return null;
  return raw![ANALYSIS_INTERVIEW_META_KEY] as InterviewSessionState;
}

export function packInterview(
  answers: Record<string, unknown>,
  interview: InterviewSessionState,
): Record<string, unknown> {
  return { ...answers, [ANALYSIS_INTERVIEW_META_KEY]: interview };
}

export function createInitialInterview(options?: {
  engine?: "legacy" | "native";
  model?: string;
  promptVersion?: string;
  openingUtterance?: string;
}): InterviewSessionState {
  const opening = (options?.openingUtterance || INTERVIEW_OPENER_QUESTION).trim();
  const opener: InterviewTurn = {
    id: "a_open",
    role: "assistant",
    text: opening,
    questionId: INTERVIEW_OPENER_ID,
    createdAt: new Date().toISOString(),
  };
  const nativeSingle = options?.engine === "native" && Boolean(options?.openingUtterance);
  return {
    version: ANALYSIS_INTERVIEW_SCHEMA_VERSION,
    turns: [opener],
    understanding: emptyUnderstandingState(),
    currentQuestionId: INTERVIEW_OPENER_ID,
    pendingAssistant: {
      response: nativeSingle ? opening : "",
      question: nativeSingle ? "" : opening,
      choices: [],
      answerMode: "free_text",
    },
    conversionSignals: [],
    safety: { flagged: false, askedSafetyQuestion: false, userReportedMedical: false },
    completionReason: null,
    aiCallCount: 0,
    lastUserFingerprint: null,
    failedAiTurns: 0,
    usedFallback: false,
    conversationEngine: options?.engine ?? "legacy",
    conversationModel: options?.model,
    promptVersion: options?.promptVersion,
  };
}

export function fingerprintInterviewAnswer(questionId: string, value: unknown): string {
  return createHash("sha256").update(`${questionId}::${JSON.stringify(value)}`).digest("hex");
}

export function interviewUserTurnCount(state: InterviewSessionState): number {
  return state.turns.filter((t) => t.role === "user").length;
}

const GENERIC_QUESTION_RE =
  /這次你最想先改善|過去比較難持續時.*最卡|平均每天大概睡多久|每週活動／運動|目前大概的身高/;

export function forbiddenGenericQuestion(q: string): boolean {
  return GENERIC_QUESTION_RE.test(q);
}

export function deterministicFallbackQuestion(_u: UnderstandingState, _lastUser: string): string {
  return "";
}

export function factGroundedInCorpus(value: string, corpus: string): boolean {
  return factGroundedInText(value, corpus);
}

export function groundUnderstandingUpdate(
  update: Record<string, { value: string; kind: "unknown" | "fact" | "inference" }>,
  corpus: string,
): Record<string, { value: string; kind: "unknown" | "fact" | "inference" }> {
  const next = { ...update };
  for (const key of Object.keys(next)) {
    const field = next[key];
    if (field.kind === "fact" && field.value && !factGroundedInText(field.value, corpus)) {
      next[key] = { value: "", kind: "unknown" };
    }
  }
  return next;
}

export type InterviewGuardLog = {
  originalQuestion: string;
  originalResponse: string;
  decision: "keep" | "replace" | "block_repair";
  replacement: string | null;
  reason: string;
};

export function applyCriticalInterviewGuards(
  _answer: string,
  ai: InterviewAiTurn,
  _understanding?: UnderstandingState,
): { ai: InterviewAiTurn; guard: InterviewGuardLog } {
  return {
    ai,
    guard: {
      originalQuestion: followUpText(ai),
      originalResponse: ai.assistant_response,
      decision: "keep",
      replacement: null,
      reason: "retired_p28_validator_owns_hard_contracts",
    },
  };
}

export function looksContradictory(state: InterviewSessionState, text: string): boolean {
  const known = [
    state.understanding.immediate_trigger.value,
    state.understanding.stated_goal.value,
    state.understanding.deeper_motivation.value,
  ].join(" ");
  if (/結婚/.test(known) && /不想結婚|沒有想結婚|不是因為結婚/.test(text)) {
    if (isSelfWeddingIntent(known) && !isOthersMarrying(known)) return true;
  }
  if (/分手|女朋友|伴侶/.test(known) && /沒有女朋友|沒這回事|她沒說過/.test(text) && !/她沒講/.test(text)) {
    return true;
  }
  return /其實不是這樣|我講錯了|搞錯了/.test(text);
}

function fallbackTurn(state: InterviewSessionState, answer: string): InterviewAiTurn {
  const out = blankTurnOutput();
  out.move = "follow_new_information";
  out.assistant_response = "我這邊沒接到完整回覆。你可以用一句話再講一次。";
  out.follow_up_question = null;
  out.reason_for_next_question = "program_hard_stop:llm_unavailable";
  out.reasoning_summary = {
    new_information: answer.slice(0, 160),
    current_interpretation: "llm unavailable",
    why_this_move: "hard stop; do not invent a questionnaire turn",
    hypothesis_being_tested: "",
  };
  out.stage = state.understanding.conversation_stage;
  const lastUser = [...state.turns].reverse().find((t) => t.role === "user");
  out.understanding_patch = extractDeterministicFacts(answer, lastUser?.id ?? "u");
  return out;
}

function applyProgrammaticSignals(answer: string, ai: InterviewAiTurn): InterviewAiTurn {
  let next = { ...ai };
  if (detectProgrammaticSafety(answer)) {
    next = {
      ...next,
      safety_signal: {
        flagged: true,
        kind: next.safety_signal.kind || "medical_context",
        note: next.safety_signal.note || "programmatic",
      },
    };
  }
  const detected = detectUserQuestionType(answer);
  if (isInterviewChallenge(answer)) {
    next = { ...next, user_question_detected: true };
  } else if (userQuestionKind(answer)) {
    next = { ...next, user_question_detected: true, next_action: "answer_then_ask" };
  } else if (
    detected === "duration_question" ||
    detected === "how_it_works" ||
    detected === "cost_question" ||
    detected === "support_interest"
  ) {
    next = {
      ...next,
      user_question_detected: true,
      next_action: "answer_then_ask",
      conversion_signal: { detected: true, type: detected },
    };
  }
  if (looksLikeTrialWillingness(answer)) {
    next = { ...next, conversion_signal: { detected: true, type: "trial_interest" } };
  }
  return next;
}

export function interviewQuestionFromState(state: InterviewSessionState): AnalysisQuestionDef | null {
  if (!state.currentQuestionId) return null;
  return {
    id: state.currentQuestionId,
    theme: "A",
    type: "free_text",
    engineType: "free_text",
    prompt: state.pendingAssistant.question,
    options: state.pendingAssistant.choices.map((label, i) => ({ id: `c${i}`, label })),
    maxLength: 400,
  };
}

export function interviewDynamicContext(state: InterviewSessionState): AnalysisAiInputSnapshot["dynamicContext"] {
  const summary = publicUnderstandingSummary(state.understanding);
  const derivedFacts: Array<{ fact: string; inference: true; evidence: string[] }> = [];
  for (const insight of state.understanding.inferred_insights) {
    derivedFacts.push({ fact: insight, inference: true, evidence: [] });
  }
  for (const [key, field] of Object.entries(summary)) {
    if (field.kind === "inference") {
      derivedFacts.push({ fact: `${key}: ${field.value}`, inference: true, evidence: [] });
    }
  }
  const reflections = state.turns
    .filter((t) => t.role === "assistant" && t.text.trim())
    .slice(-4)
    .map((t) => ({ text: t.text.slice(0, 220), evidence: [] as string[] }));
  return {
    primaryBranch: null,
    completedSlots: [],
    activeBranches: [],
    reflections,
    derivedFacts,
    understanding: summary,
    conversationStage: state.understanding.conversation_stage,
  };
}

export function interviewAnswersBridge(state: InterviewSessionState): AnalysisIntakeAnswers {
  const u = state.understanding;
  const lastSafety = [...state.turns]
    .reverse()
    .find((t) => t.questionId === INTERVIEW_SAFETY_QUESTION_ID && t.role === "user");
  const safetyYes =
    state.safety.userReportedMedical ||
    isKnown(u.safety_context) ||
    Boolean(lastSafety && /有|醫師|醫生|血糖|叮嚀/.test(lastSafety.text) && !/^沒/.test(lastSafety.text.trim()));
  const barrierBlob = `${u.primary_barrier.value} ${u.lifestyle_constraints.value} ${u.dropout_pattern.value}`;
  return {
    why_now: u.immediate_trigger.value || u.deeper_motivation.value || u.stated_goal.value || undefined,
    why_stuck: /放棄/.test(barrierBlob)
      ? "all_or_nothing"
      : /忙|時間|工作/.test(barrierBlob)
        ? "schedule"
        : /情緒|壓力/.test(u.primary_barrier.value)
          ? "diet_control"
          : u.primary_barrier.value
            ? "other"
            : undefined,
    commitment: /願意|試試/.test(u.readiness_stage.value) ? 4 : isKnown(u.readiness_stage) ? 3 : undefined,
    help_wanted: /陪|微調|有人/.test(`${u.support_receptivity.value} ${u.acceptable_change.value}`)
      ? "accountability"
      : isKnown(u.acceptable_change)
        ? "simple_plan"
        : undefined,
    safety_gate: safetyYes ? "yes" : "no",
  };
}

export type InterviewTurnTimings = {
  compactContextMs: number;
  openaiDispatchMs: number;
  openaiMs: number;
  parseMs: number;
  groundingMs: number;
  steeringMs: number;
  inputTokens: number;
  outputTokens: number;
  usedLlm: boolean;
  usedDeterministic: boolean;
  usedFallback: boolean;
};

export type InterviewTurnDebug = {
  gap: ReturnType<typeof namedHighValueGap>;
  sufficiency: ReturnType<typeof assessSufficiency>;
  reason: string;
  stage: string;
  userQuestion: boolean;
  usedDeterministic: boolean;
  usedLlm: boolean;
  patch: {
    facts: Array<{ field: string; value: string }>;
    inferences: Array<{ field: string; value: string; reasoning: string }>;
    rejected: Array<{ field: string; value: string; reason: string }>;
  };
  steering: SteeringDecision | null;
  coherence: QuestionCoherence | null;
  whyThisQuestionNow: string | null;
  move?: string | null;
  reasoningSummary?: {
    new_information: string;
    current_interpretation: string;
    why_this_move: string;
    hypothesis_being_tested: string;
  } | null;
  novelty?: {
    novelty: string;
    introduced_dimensions: string[];
    should_redirect_next_question: boolean;
    reason: string;
  } | null;
  pivot?: { pivot: boolean; reason: string; previous_purpose: string } | null;
  guard?: InterviewGuardLog | null;
  selfCheck?: { repair: boolean; reasons: string[]; originalQuestion: string | null } | null;
  humanModel?: CurrentHumanModel | null;
  informationValue?: string | null;
  questionNecessary?: { necessary: boolean; reason: string; preferredMove: string } | null;
  visibleTextOwner?: "LLM_PRIMARY" | "LLM_REGENERATED" | "PROGRAM_HARD_STOP";
  rawResponse?: string | null;
  rawFollowUp?: string | null;
  validation?: {
    ok: boolean;
    violations: string[];
    interrogativeActs: number;
    medicalViolation: boolean;
  } | null;
  rawValidation?: {
    ok: boolean;
    violations: string[];
    interrogativeActs: number;
    medicalViolation: boolean;
  } | null;
  regenerated?: boolean;
};

export function logInterviewTurnTelemetry(event: {
  userTurns: number;
  latencyMs: number;
  openaiMs?: number;
  parseMs?: number;
  inputTokens: number;
  outputTokens: number;
  usedFallback: boolean;
  usedLlm?: boolean;
  usedDeterministic?: boolean;
  complete: boolean;
  stage: string;
  aiCallCount: number;
  gap?: string;
}): void {
  console.info(
    JSON.stringify({
      type: "analysis_interview_turn",
      timestamp: new Date().toISOString(),
      ...event,
    }),
  );
}

export async function processInterviewAnswer(input: {
  state: InterviewSessionState;
  questionId: string;
  value: unknown;
  quiz: {
    animalName: string;
    tagline: string;
    headline: string;
    coreInsight: string;
    primaryGoal: string | null;
    readiness: string | null;
  };
}): Promise<{
  state: InterviewSessionState;
  complete: boolean;
  usedFallback: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  timings: InterviewTurnTimings;
  debug: InterviewTurnDebug;
}> {
  const text =
    typeof input.value === "string"
      ? input.value.trim()
      : typeof input.value === "object" && input.value && "text" in (input.value as object)
        ? String((input.value as { text: string }).text).trim()
        : String(input.value ?? "").trim();
  if (!text) {
    throw new Error("invalid_answer:請用一句話回答。");
  }
  if (text.length > 400) {
    throw new Error("invalid_answer:請控制在 400 字以內。");
  }

  const fp = fingerprintInterviewAnswer(input.questionId, text);
  if (input.state.lastUserFingerprint === fp) {
    return {
      state: input.state,
      complete: Boolean(input.state.completionReason),
      usedFallback: input.state.usedFallback,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      timings: {
        compactContextMs: 0,
        openaiDispatchMs: 0,
        openaiMs: 0,
        parseMs: 0,
        groundingMs: 0,
        steeringMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        usedLlm: false,
        usedDeterministic: false,
        usedFallback: input.state.usedFallback,
      },
      debug: {
        gap: namedHighValueGap(input.state.understanding),
        sufficiency: assessSufficiency(input.state.understanding),
        reason: "idempotent",
        stage: input.state.understanding.conversation_stage,
        userQuestion: false,
        usedDeterministic: false,
        usedLlm: false,
        patch: { facts: [], inferences: [], rejected: [] },
        steering: null,
        coherence: null,
        whyThisQuestionNow: null,
      },
    };
  }
  if (input.questionId !== input.state.currentQuestionId) {
    const lastUser = [...input.state.turns].reverse().find((t) => t.role === "user");
    if (lastUser && lastUser.questionId === input.questionId && lastUser.text === text) {
      return {
        state: input.state,
        complete: Boolean(input.state.completionReason),
        usedFallback: input.state.usedFallback,
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        timings: {
          compactContextMs: 0,
          openaiDispatchMs: 0,
          openaiMs: 0,
          parseMs: 0,
          groundingMs: 0,
          steeringMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          usedLlm: false,
          usedDeterministic: false,
          usedFallback: input.state.usedFallback,
        },
        debug: {
          gap: namedHighValueGap(input.state.understanding),
          sufficiency: assessSufficiency(input.state.understanding),
          reason: "idempotent",
          stage: input.state.understanding.conversation_stage,
          userQuestion: false,
          usedDeterministic: false,
          usedLlm: false,
        patch: { facts: [], inferences: [], rejected: [] },
        steering: null,
        coherence: null,
        whyThisQuestionNow: null,
      },
      };
    }
    throw new Error("question_mismatch");
  }

  const userTurnId = `u_${input.state.turns.length + 1}`;
  let state: InterviewSessionState = {
    ...input.state,
    turns: [
      ...input.state.turns,
      { id: userTurnId, role: "user", text, questionId: input.questionId, createdAt: new Date().toISOString() },
    ],
    lastUserFingerprint: fp,
  };

  let usedFallback = false;
  let usedDeterministic = false;
  let usedLlm = false;
  let latencyMs = 0;
  let compactContextMs = 0;
  let openaiDispatchMs = 0;
  let openaiMs = 0;
  let parseMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let ai: InterviewAiTurn | null = null;

  const bypass = shouldBypassInterviewLlm({
    answer: text,
    understanding: input.state.understanding,
  });
  if (bypass.bypass) {
    usedDeterministic = true;
    ai = blankTurnOutput();
    ai.reason_for_next_question = `deterministic_fast_path:${bypass.reason}`;
    if (bypass.reason === "trial_complete") {
      ai.next_action = "complete";
      ai.follow_up_question = null;
      ai.assistant_response = "";
    }
  } else {
    for (let attempt = 0; attempt < ANALYSIS_INTERVIEW_MAX_ATTEMPTS && !ai; attempt += 1) {
      try {
        const generated = await generateInterviewTurn({
          quiz: input.quiz,
          state,
          previousQuestion: input.state.pendingAssistant.question,
          currentAnswer: text,
          userTurnId,
          userTurnCount: interviewUserTurnCount(state),
        });
        ai = generated.output;
        usedLlm = !generated.usedFixture;
        latencyMs += generated.latencyMs;
        compactContextMs += generated.compactContextMs;
        openaiDispatchMs += generated.openaiDispatchMs;
        openaiMs += generated.openaiMs;
        parseMs += generated.parseMs;
        inputTokens += generated.inputTokens;
        outputTokens += generated.outputTokens;
        state = { ...state, aiCallCount: state.aiCallCount + 1, failedAiTurns: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        state = { ...state, failedAiTurns: state.failedAiTurns + 1 };
        if (message === "timeout") break;
      }
    }
  }
  if (!ai) {
    ai = fallbackTurn(state, text);
    usedFallback = true;
    state = { ...state, usedFallback: true };
  }

  ai = applyProgrammaticSignals(text, ai);
  const rawFollowUp = followUpText(ai);
  const rawResponse = ai.assistant_response;
  let visibleTextOwner: "LLM_PRIMARY" | "LLM_REGENERATED" | "PROGRAM_HARD_STOP" = usedFallback
    ? "PROGRAM_HARD_STOP"
    : "LLM_PRIMARY";
  let validation: ConversationValidation = validateConversationTurn({
    answer: text,
    ai,
    understanding: input.state.understanding,
    previousQuestion: input.state.pendingAssistant.question,
  });
  const rawValidation = validation;
  let regenerated = false;
  if (!validation.ok && usedLlm && !usedFallback) {
    try {
      const repaired = await generateInterviewTurn({
        quiz: input.quiz,
        state,
        previousQuestion: input.state.pendingAssistant.question,
        currentAnswer: text,
        userTurnId,
        userTurnCount: interviewUserTurnCount(state),
        contractRepair: {
          violations: validation.violations,
          note: "Fix only these hard contract violations. follow_up_question may be null. Do not invent a generic probe. Visible turn may have at most one interrogative act. Do not ask how to treat labs.",
        },
      });
      ai = applyProgrammaticSignals(text, repaired.output);
      usedLlm = !repaired.usedFixture;
      latencyMs += repaired.latencyMs;
      compactContextMs += repaired.compactContextMs;
      openaiDispatchMs += repaired.openaiDispatchMs;
      openaiMs += repaired.openaiMs;
      parseMs += repaired.parseMs;
      inputTokens += repaired.inputTokens;
      outputTokens += repaired.outputTokens;
      state = { ...state, aiCallCount: state.aiCallCount + 1 };
      regenerated = !repaired.usedFixture;
      visibleTextOwner = regenerated ? "LLM_REGENERATED" : visibleTextOwner;
      validation = validateConversationTurn({
        answer: text,
        ai,
        understanding: input.state.understanding,
        previousQuestion: input.state.pendingAssistant.question,
      });
    } catch {
      // keep first output; hard-stop below
    }
  }
  if (!validation.ok) {
    const stopped = applyProgramHardStop(text, ai, validation);
    ai = stopped.ai;
    visibleTextOwner = stopped.owner;
    validation = validateConversationTurn({
      answer: text,
      ai,
      understanding: input.state.understanding,
      previousQuestion: input.state.pendingAssistant.question,
    });
  }

  const groundingStarted = Date.now();
  const grounded = groundPatches({
    patches: ai.understanding_patch ?? [],
    currentAnswer: text,
    currentTurnId: userTurnId,
    turns: input.state.turns,
  });
  const previousPurpose = purposeForGap(namedHighValueGap(input.state.understanding));
  const deterministic = extractDeterministicFacts(text, userTurnId);
  const accepted = [...grounded.accepted, ...deterministic].filter(
    (p) => !slotCoercionRejects(p.field, text, previousPurpose),
  ).filter((p) => {
    if (!isOthersMarrying(text)) return true;
    return !/^(想結婚|要結婚|辦婚宴)$/.test(p.value.trim());
  });
  ai = { ...ai, understanding_patch: accepted };
  const contradictory = looksContradictory(input.state, text);

  let understanding = contradictory
    ? input.state.understanding
    : mergeUnderstanding(state.understanding, patchesToPartial(accepted), {
        evidence: ai.evidence,
        inferred_insights: accepted
          .filter((p) => p.kind === "inference")
          .map((p) => p.value)
          .filter(Boolean),
        stage: ai.stage === "complete" ? state.understanding.conversation_stage : ai.stage,
      });
  if (!contradictory) {
    understanding = {
      ...understanding,
      hypotheses: maybeConfirmHypothesis(understanding, text, userTurnId),
    };
  }
  const groundingMs = Date.now() - groundingStarted;

  const previousGap = namedHighValueGap(input.state.understanding);
  const previousQuestion = input.state.pendingAssistant.question;
  const steeringStarted = Date.now();

  if (!contradictory) {
    const userQuestionNow = ai.next_action === "answer_then_ask" || ai.user_question_detected;
    ai = applyInformationGain({
      understanding,
      answer: text,
      ai,
      userQuestion: userQuestionNow,
      previousGap,
      previousQuestion,
      before: input.state.understanding,
    });
  }

  const humanModel = buildCurrentHumanModel({
    answer: text,
    before: input.state.understanding,
    after: understanding,
  });
  if (ai.assistant_response.length > 420) ai.assistant_response = ai.assistant_response.slice(0, 420);
  const presented = interviewActivePresentation({
    response: ai.assistant_response,
    question: followUpText(ai),
  });
  ai.assistant_response = presented.reflection ?? "";
  ai.follow_up_question = presented.question ? presented.question : ai.follow_up_question;
  if (!presented.question && !followUpText(ai)) ai.follow_up_question = null;
  const steeringMs = Date.now() - steeringStarted;

  const safetyFlagged = state.safety.flagged || ai.safety_signal.flagged || detectProgrammaticSafety(text);
  const userReportedMedical = state.safety.userReportedMedical || detectProgrammaticSafety(text);
  let askedSafety = state.safety.askedSafetyQuestion || input.questionId === INTERVIEW_SAFETY_QUESTION_ID;
  if (userReportedMedical || isKnown(understanding.safety_context)) askedSafety = true;

  const conversionSignals = [...state.conversionSignals];
  if (ai.conversion_signal.detected && ai.conversion_signal.type) {
    conversionSignals.push({ type: ai.conversion_signal.type as ConversionSignalType, turnId: userTurnId });
  }

  const turnsAfter = interviewUserTurnCount(state);
  const atHardMax = turnsAfter >= ANALYSIS_INTERVIEW_BOUNDS.hardMax;
  const enough = semanticEnough(understanding);
  const useful = usefulUnderstandingReady(understanding);
  const immediate = shouldCompleteImmediately(understanding, text);
  const userQuestion = ai.next_action === "answer_then_ask" || ai.user_question_detected;
  const answeringSafety = input.questionId === INTERVIEW_SAFETY_QUESTION_ID;
  const modelComplete = ai.next_action === "complete";
  const lateEnough =
    turnsAfter >= ANALYSIS_INTERVIEW_BOUNDS.typicalMax && useful && !userQuestion;

  const programWantsComplete =
    answeringSafety ||
    atHardMax ||
    (enough && !userQuestion && (immediate || turnsAfter >= ANALYSIS_INTERVIEW_BOUNDS.recommendedMin)) ||
    (modelComplete && useful && turnsAfter >= ANALYSIS_INTERVIEW_BOUNDS.recommendedMin && !userQuestion) ||
    lateEnough;

  let complete = false;
  let completionReason: InterviewSessionState["completionReason"] = null;
  let pending = {
    response: ai.assistant_response,
    question: followUpText(ai),
    choices: ai.optional_choices,
    answerMode: ai.answer_mode,
  };
  let currentQuestionId = `iv_t${turnsAfter + 1}`;

  const safetyState: InterviewSessionState = {
    ...state,
    safety: { flagged: safetyFlagged, askedSafetyQuestion: askedSafety, userReportedMedical },
  };

  if (programWantsComplete && needsSafetyBoundary(safetyState, understanding) && !answeringSafety && !atHardMax) {
    askedSafety = true;
    pending = {
      response: ai.assistant_response || "我想再確認一件跟健康有關的事。",
      question: INTERVIEW_SAFETY_QUESTION,
      choices: ["沒有，醫師沒有特別叮嚀", "有，我補充在上面"],
      answerMode: "optional_choices",
    };
    currentQuestionId = INTERVIEW_SAFETY_QUESTION_ID;
  } else if (programWantsComplete) {
    complete = true;
    completionReason = atHardMax
      ? "hard_max"
      : immediate
        ? "semantic"
        : usedFallback && !enough
          ? "fallback"
          : safetyFlagged && answeringSafety
            ? "safety_stop"
            : "semantic";
    currentQuestionId = "";
    pending = { response: ai.assistant_response, question: "", choices: [], answerMode: "free_text" };
    understanding = { ...understanding, conversation_stage: "complete" };
  } else if (!pending.question.trim()) {
    if (modelComplete && (enough || useful) && turnsAfter >= ANALYSIS_INTERVIEW_BOUNDS.recommendedMin) {
      complete = true;
      completionReason = "semantic";
      currentQuestionId = "";
      pending = { response: ai.assistant_response, question: "", choices: [], answerMode: "free_text" };
      understanding = { ...understanding, conversation_stage: "complete" };
    }
  }

  if (!complete && pending.question) {
    understanding = maybeProposeHypothesis(understanding, pending.question, userTurnId);
  }

  const assistantTurn: InterviewTurn | null = complete
    ? ai.assistant_response
      ? {
          id: `a_${state.turns.length + 1}`,
          role: "assistant",
          text: ai.assistant_response,
          createdAt: new Date().toISOString(),
        }
      : null
    : {
        id: `a_${state.turns.length + 1}`,
        role: "assistant",
        text: [pending.response, pending.question].filter(Boolean).join("\n\n"),
        questionId: currentQuestionId,
        createdAt: new Date().toISOString(),
      };

  state = {
    ...state,
    understanding,
    currentQuestionId,
    pendingAssistant: pending,
    conversionSignals,
    safety: { flagged: safetyFlagged, askedSafetyQuestion: askedSafety, userReportedMedical },
    completionReason,
    usedFallback: state.usedFallback || usedFallback,
    turns: assistantTurn ? [...state.turns, assistantTurn] : state.turns,
  };

  const finalGap = namedHighValueGap(understanding);
  const novelty = evaluateAnswerNovelty({
    before: input.state.understanding,
    after: understanding,
    answer: text,
    previousGap,
    previousPurpose: purposeForGap(previousGap),
  });
  const pivot = detectSemanticPivot({
    previousPurpose: purposeForGap(previousGap),
    previousQuestion,
    answer: text,
    introduced: novelty.introduced_dimensions,
  });
  const coherence = evaluateQuestionCoherence({
    latestUserAnswer: text,
    groundedPatch: accepted,
    confirmedFacts: Object.fromEntries(
      accepted.filter((p) => p.kind === "fact").map((p) => [p.field, p.value]),
    ),
    activeHypotheses: (understanding.hypotheses ?? [])
      .filter((h) => h.status === "proposed" || h.status === "confirmed")
      .map((h) => ({ c: h.claim, s: h.status })),
    previousGap,
    currentGap: finalGap,
    proposedQuestion: pending.question,
    questionPurpose: purposeForGap(finalGap),
    understanding,
    before: input.state.understanding,
    noveltyHigh: novelty.novelty === "high",
  });
  const whyNow = whyThisQuestionNow({
    answer: text,
    patchFacts: accepted.filter((p) => p.kind === "fact").map((p) => ({ field: p.field, value: p.value })),
    previousGap,
    currentGap: finalGap,
    purpose: purposeForGap(finalGap),
    question: pending.question,
    coherence,
  });

  return {
    state,
    complete,
    usedFallback: state.usedFallback,
    latencyMs,
    inputTokens,
    outputTokens,
    timings: {
      compactContextMs,
      openaiDispatchMs,
      openaiMs,
      parseMs,
      groundingMs,
      steeringMs,
      inputTokens,
      outputTokens,
      usedLlm,
      usedDeterministic,
      usedFallback,
    },
    debug: {
      gap: namedHighValueGap(understanding),
      sufficiency: assessSufficiency(understanding),
      reason: ai.reason_for_next_question,
      stage: understanding.conversation_stage,
      userQuestion,
      usedDeterministic,
      usedLlm,
      patch: {
        facts: accepted.filter((p) => p.kind === "fact").map((p) => ({ field: p.field, value: p.value })),
        inferences: accepted
          .filter((p) => p.kind === "inference")
          .map((p) => ({ field: p.field, value: p.value, reasoning: p.reasoning })),
        rejected: grounded.rejected.map((p) => ({
          field: p.field,
          value: p.value,
          reason: p.reject_reason,
        })),
      },
      steering: evaluateSteering({
        previousGap,
        previousQuestion,
        before: input.state.understanding,
        after: understanding,
        answer: text,
        nextGap: namedHighValueGap(understanding),
        proposedQuestion: pending.question,
      }),
      coherence,
      whyThisQuestionNow: whyNow,
      move: ai.move ?? null,
      reasoningSummary: ai.reasoning_summary ?? null,
      novelty: {
        novelty: novelty.novelty,
        introduced_dimensions: novelty.introduced_dimensions,
        should_redirect_next_question: novelty.should_redirect_next_question,
        reason: novelty.reason,
      },
      pivot: { pivot: pivot.pivot, reason: pivot.reason, previous_purpose: String(pivot.previous_purpose) },
      guard: null,
      selfCheck: { repair: false, reasons: [], originalQuestion: followUpText(ai) },
      humanModel,
      informationValue: humanModel.information_value,
      questionNecessary: null,
      visibleTextOwner,
      rawResponse,
      rawFollowUp,
      validation,
      rawValidation,
      regenerated,
    },
  };
}
