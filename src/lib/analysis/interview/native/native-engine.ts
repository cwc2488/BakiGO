import {
  ANALYSIS_INTERVIEW_BOUNDS,
  INTERVIEW_SAFETY_QUESTION,
  INTERVIEW_SAFETY_QUESTION_ID,
  type ConversionSignalType,
  type InterviewSessionState,
  type InterviewTurn,
} from "@/lib/analysis/interview/interview-contract";
import {
  extractDeterministicFacts,
  groundPatches,
  maybeConfirmHypothesis,
  patchesToPartial,
} from "@/lib/analysis/interview/interview-grounding";
import { needsSafetyBoundary } from "@/lib/analysis/interview/interview-quality";
import { usefulUnderstandingReady } from "@/lib/analysis/interview/interview-reasoner";
import {
  fingerprintInterviewAnswer,
  interviewUserTurnCount,
  type InterviewTurnDebug,
  type InterviewTurnTimings,
} from "@/lib/analysis/interview/interview-engine";
import { generateNativeInterviewTurn } from "@/lib/analysis/interview/native/native-provider";
import { NATIVE_INTERVIEW_PROMPT_VERSION, type NativeInterviewTurn } from "@/lib/analysis/interview/native/native-contract";
import { CHATGPT_CONSULTANT_PROMPT_VERSION } from "@/lib/analysis/interview/chatgpt/chatgpt-contract";
import {
  shouldRegenerateChatgptTurn,
  validateChatgptTurn,
} from "@/lib/analysis/interview/chatgpt/chatgpt-validate";
import {
  resolveNativeConsultantVariant,
  resolveNativeInterviewModel,
} from "@/lib/analysis/interview/native/native-path";
import {
  detectDirectUserQuestion,
  logNativeContractFailure,
  shouldRegenerateNativeTurn,
  stripUnsafeMedicalCopy,
  validateNativeTurn,
  visibleNativeText,
} from "@/lib/analysis/interview/native/native-validate";
import {
  isKnown,
  mergeUnderstanding,
  type UnderstandingState,
} from "@/lib/analysis/interview/understanding-state";

const usefulUnderstanding = usefulUnderstandingReady;

function fallbackNativeTurn(): NativeInterviewTurn {
  return {
    assistant_response: "我這邊沒接到完整回覆。你可以用一句話再講一次。",
    conversation_action: "reflect",
    understanding_patch: [],
    hypotheses: [],
    completion_signal: { ready: false, reason: "llm_unavailable" },
    safety_signal: { needs_boundary: false, reason: null },
  };
}

function conversionFromAnswer(answer: string): ConversionSignalType | null {
  const kind = detectDirectUserQuestion(answer);
  if (kind === "duration") return "duration_question";
  if (kind === "cost") return "cost_question";
  if (kind === "how") return "how_it_works";
  if (kind === "support") return "support_interest";
  if (kind === "difficulty") return "readiness_language";
  return null;
}

export async function processNativeInterviewAnswer(input: {
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
    quizPrior?: unknown;
    quizHistory?: Array<{ question: string; selected: string[] }>;
  };
  consultantVariant?: "current" | "chatgpt";
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
  if (!text) throw new Error("invalid_answer:請用一句話回答。");
  if (text.length > 400) throw new Error("invalid_answer:請控制在 400 字以內。");

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
        gap: "none",
        sufficiency: {
          motivation: false,
          barrier: false,
          mechanism: false,
          changeFit: false,
          readiness: false,
        },
        reason: "idempotent",
        stage: input.state.understanding.conversation_stage,
        userQuestion: false,
        usedDeterministic: false,
        usedLlm: false,
        patch: { facts: [], inferences: [], rejected: [] },
        steering: null,
        coherence: null,
        whyThisQuestionNow: null,
        visibleTextOwner: "LLM_PRIMARY",
      },
    };
  }
  if (input.questionId !== input.state.currentQuestionId) {
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

  const model = input.state.conversationModel || resolveNativeInterviewModel();
  const chatgpt =
    resolveNativeConsultantVariant(
      input.consultantVariant ??
        (input.state.promptVersion === CHATGPT_CONSULTANT_PROMPT_VERSION ? "chatgpt" : "current"),
    ) === "chatgpt";
  let usedFallback = false;
  let usedLlm = false;
  let latencyMs = 0;
  let compactContextMs = 0;
  let openaiDispatchMs = 0;
  let openaiMs = 0;
  let parseMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let native: NativeInterviewTurn | null = null;
  let visibleTextOwner: "LLM_PRIMARY" | "LLM_REGENERATED" | "PROGRAM_HARD_STOP" = "LLM_PRIMARY";
  let regenerated = false;

  const generateArgs = {
    quiz: input.quiz,
    state,
    currentAnswer: text,
    userTurnId,
    userTurnCount: interviewUserTurnCount(state),
    model,
    consultantVariant: chatgpt ? ("chatgpt" as const) : ("current" as const),
  };

  try {
    const generated = await generateNativeInterviewTurn(generateArgs);
    native = generated.output;
    usedLlm = !generated.usedFixture;
    latencyMs = generated.latencyMs;
    compactContextMs = generated.compactContextMs;
    openaiDispatchMs = generated.openaiDispatchMs;
    openaiMs = generated.openaiMs;
    parseMs = generated.parseMs;
    inputTokens = generated.inputTokens;
    outputTokens = generated.outputTokens;
    state = { ...state, aiCallCount: state.aiCallCount + 1, failedAiTurns: 0 };
    visibleTextOwner = "LLM_PRIMARY";
  } catch {
    native = fallbackNativeTurn();
    usedFallback = true;
    visibleTextOwner = "PROGRAM_HARD_STOP";
    state = { ...state, usedFallback: true, failedAiTurns: state.failedAiTurns + 1 };
  }

  const rawResponse = native.assistant_response;
  let validation = chatgpt
    ? validateChatgptTurn({ answer: text, turn: native })
    : validateNativeTurn({ answer: text, turn: native });
  if (!validation.ok) {
    logNativeContractFailure({
      violations: validation.violations,
      answer: text,
      visible: visibleNativeText(native),
      original: rawResponse,
      finalText: visibleNativeText(native),
      reason: validation.violations.join(","),
    });
  }
  const shouldRegen = chatgpt
    ? shouldRegenerateChatgptTurn(validation.violations)
    : shouldRegenerateNativeTurn(validation.violations);
  if (!usedFallback && usedLlm && shouldRegen) {
    try {
      const repaired = await generateNativeInterviewTurn({
        ...generateArgs,
        contractRepair: {
          violations: validation.violations,
          note: chatgpt
            ? "Fix only these hard constraints. Keep one assistant_response. Do not interrogate. Cost: this stage is understanding, not a quote — do not invent prices. Do not diagnose or treat. Do not rewrite into an interview template."
            : "Fix only these hard contract violations. Keep a single assistant_response. At most one interrogative intent. Do not invent a questionnaire template. Cost: this stage is analysis not a quote, do not invent prices. Do not diagnose or treat. Stay a body-change consultant.",
        },
      });
      native = repaired.output;
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
      validation = chatgpt
        ? validateChatgptTurn({ answer: text, turn: native })
        : validateNativeTurn({ answer: text, turn: native });
      logNativeContractFailure({
        violations: validation.violations,
        answer: text,
        visible: visibleNativeText(native),
        original: rawResponse,
        regeneratedText: native.assistant_response,
        finalText: native.assistant_response,
        reason: validation.violations.length ? validation.violations.join(",") : "repaired",
        regenerated: true,
      });
    } catch {
      // Keep the original LLM utterance. Do not write a replacement question.
    }
  }
  if (validation.violations.includes("unsafe_medical") || validation.violations.includes("medical_coaching_question")) {
    native = {
      ...native,
      assistant_response: stripUnsafeMedicalCopy(native.assistant_response),
    };
  }
  if (!native.assistant_response.trim()) {
    native = {
      ...native,
      assistant_response: state.pendingAssistant.response || native.assistant_response,
    };
  }

  const groundingStarted = Date.now();
  const grounded = groundPatches({
    patches: native.understanding_patch ?? [],
    currentAnswer: text,
    currentTurnId: userTurnId,
    turns: input.state.turns,
  });
  const deterministic = extractDeterministicFacts(text, userTurnId);
  const accepted = [...grounded.accepted, ...deterministic];
  let understanding: UnderstandingState = mergeUnderstanding(state.understanding, patchesToPartial(accepted), {
    evidence: accepted.map((p) => ({
      claim: p.value,
      source_turn_id: userTurnId,
      type: p.kind,
    })),
    inferred_insights: accepted.filter((p) => p.kind === "inference").map((p) => p.value),
    stage: native.conversation_action === "complete" ? state.understanding.conversation_stage : state.understanding.conversation_stage,
  });
  understanding = {
    ...understanding,
    hypotheses: maybeConfirmHypothesis(understanding, text, userTurnId),
  };
  if (native.hypotheses.length) {
    const extra = native.hypotheses
      .filter((h) => h.status === "proposed" && h.claim.trim())
      .slice(0, 3)
      .map((h, i) => ({
        id: `n_${userTurnId}_${i}`,
        claim: h.claim.slice(0, 160),
        status: "proposed" as const,
        evidence_turn_ids: [userTurnId],
        reasoning: "native_model_hypothesis",
      }));
    understanding = { ...understanding, hypotheses: [...(understanding.hypotheses ?? []), ...extra].slice(-8) };
  }
  const groundingMs = Date.now() - groundingStarted;

  const response =
    native.assistant_response.trim() ||
    ((native.conversation_action === "complete" || native.completion_signal.ready)
      ? state.pendingAssistant.response.trim()
      : "");
  const question = "";

  const safetyFlagged =
    state.safety.flagged || native.safety_signal.needs_boundary || /醫生|醫師|血糖|紅字|吃藥/.test(text);
  const userReportedMedical = state.safety.userReportedMedical || /醫生|醫師|血糖|紅字|吃藥/.test(text);
  let askedSafety = state.safety.askedSafetyQuestion || input.questionId === INTERVIEW_SAFETY_QUESTION_ID;
  if (userReportedMedical || isKnown(understanding.safety_context)) askedSafety = true;

  const conversionSignals = [...state.conversionSignals];
  const conversionType = conversionFromAnswer(text);
  if (conversionType) conversionSignals.push({ type: conversionType, turnId: userTurnId });

  const turnsAfter = interviewUserTurnCount(state);
  const atHardMax = turnsAfter >= ANALYSIS_INTERVIEW_BOUNDS.hardMax;
  const enough = usefulUnderstanding(understanding);
  const userQuestion = Boolean(detectDirectUserQuestion(text));
  const answeringSafety = input.questionId === INTERVIEW_SAFETY_QUESTION_ID;
  const modelComplete =
    (native.conversation_action === "complete" || native.completion_signal.ready) && Boolean(response);
  const recommended = turnsAfter >= ANALYSIS_INTERVIEW_BOUNDS.recommendedMin;

  const programWantsComplete = chatgpt
    ? answeringSafety || atHardMax || (modelComplete && !userQuestion)
    : answeringSafety ||
      atHardMax ||
      (modelComplete && enough && recommended && !userQuestion);

  let complete = false;
  let completionReason: InterviewSessionState["completionReason"] = null;
  let pending: InterviewSessionState["pendingAssistant"] = {
    response,
    question,
    choices: [],
    answerMode: "free_text",
  };
  let currentQuestionId = `iv_t${turnsAfter + 1}`;
  const safetyState: InterviewSessionState = {
    ...state,
    safety: { flagged: safetyFlagged, askedSafetyQuestion: askedSafety, userReportedMedical },
  };

  if (programWantsComplete && needsSafetyBoundary(safetyState, understanding) && !answeringSafety && !atHardMax) {
    askedSafety = true;
    pending = {
      response: response || "我想再確認一件跟健康有關的事。",
      question: INTERVIEW_SAFETY_QUESTION,
      choices: ["沒有，醫師沒有特別叮嚀", "有，我補充在上面"],
      answerMode: "optional_choices",
    };
    currentQuestionId = INTERVIEW_SAFETY_QUESTION_ID;
  } else if (programWantsComplete) {
    complete = true;
    completionReason = atHardMax ? "hard_max" : "semantic";
    currentQuestionId = "";
    pending = { response, question: "", choices: [], answerMode: "free_text" };
    understanding = { ...understanding, conversation_stage: "complete" };
  }

  const assistantTurn: InterviewTurn | null = complete
    ? response
      ? {
          id: `a_${state.turns.length + 1}`,
          role: "assistant",
          text: response,
          createdAt: new Date().toISOString(),
        }
      : null
    : {
        id: `a_${state.turns.length + 1}`,
        role: "assistant",
        text: pending.question
          ? [pending.response, pending.question].filter(Boolean).join("\n\n")
          : pending.response,
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
    turns: assistantTurn ? [...state.turns, assistantTurn] : state.turns,
    conversationEngine: "native",
    conversationModel: model,
    promptVersion: chatgpt ? CHATGPT_CONSULTANT_PROMPT_VERSION : NATIVE_INTERVIEW_PROMPT_VERSION,
  };

  return {
    state,
    complete,
    usedFallback,
    latencyMs,
    inputTokens,
    outputTokens,
    timings: {
      compactContextMs,
      openaiDispatchMs,
      openaiMs,
      parseMs,
      groundingMs,
      steeringMs: 0,
      inputTokens,
      outputTokens,
      usedLlm,
      usedDeterministic: false,
      usedFallback,
    },
    debug: {
      gap: "none",
      sufficiency: {
        motivation: enough,
        barrier: enough,
        mechanism: enough,
        changeFit: enough,
        readiness: enough,
      },
      reason: native.completion_signal.reason || native.conversation_action,
      stage: understanding.conversation_stage,
      userQuestion,
      usedDeterministic: false,
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
      steering: null,
      coherence: null,
      whyThisQuestionNow: native.conversation_action,
      move: native.conversation_action,
      reasoningSummary: {
        new_information: text.slice(0, 160),
        current_interpretation: native.completion_signal.reason.slice(0, 160),
        why_this_move: native.conversation_action,
        hypothesis_being_tested: native.hypotheses[0]?.claim ?? "",
      },
      visibleTextOwner,
      rawResponse,
      rawFollowUp: null,
      validation: {
        ok: validation.ok,
        violations: validation.violations,
        interrogativeActs: validation.interrogativeActs,
        medicalViolation:
          validation.violations.includes("medical_coaching_question") ||
          validation.violations.includes("unsafe_medical"),
      },
      rawValidation: {
        ok: validation.ok,
        violations: validation.violations,
        interrogativeActs: validation.interrogativeActs,
        medicalViolation:
          validation.violations.includes("medical_coaching_question") ||
          validation.violations.includes("unsafe_medical"),
      },
      regenerated,
    },
  };
}
