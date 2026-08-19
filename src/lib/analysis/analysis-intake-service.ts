import { createHash } from "node:crypto";
import { after } from "next/server";
import {
  normalizeAnalysisState,
  type AnalysisState,
} from "@/lib/analysis/analysis-attribution";
import {
  ANALYSIS_QUESTIONS,
  type AnalysisIntakeAnswers,
} from "@/lib/analysis/analysis-questions";
import { ANALYSIS_DYNAMIC_SCHEMA_VERSION, type AnalysisEngineState, type AnalysisReflection } from "@/lib/analysis/analysis-dynamic-model";
import {
  answersEqual,
  applyAnalysisAnswer,
  dynamicContextForReport,
  hydrateEngineFromPersisted,
  packAnswersWithEngine,
  primaryBranch,
  resolveAnalysisQuestion,
  resolveDynamicMilestones,
} from "@/lib/analysis/analysis-dynamic-engine";
import {
  ANALYSIS_LAYER1_PROGRESS_COPY,
  buildAnalysisLayer1Report,
  resolveAnalysisProgressStages,
  type AnalysisLayer1Report,
} from "@/lib/analysis/build-analysis-layer1";
import {
  AnalysisSessionError,
  requireAnalysisSessionRowByToken,
  touchAnalysisSession,
} from "@/lib/analysis/analysis-session-service";
import { ACTION_HISTORY_LABELS } from "@/lib/quiz/fat-loss/questions";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import { getPersonalityProfile } from "@/lib/quiz/fat-loss/personality-content";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { enqueueAnalysisAiGeneration } from "@/lib/analysis/analysis-generation-service";
import { drainAnalysisGenerationQueueWithRetry } from "@/lib/analysis/kick-analysis-generation-worker";
import type { AnalysisAiReport } from "@/lib/analysis/analysis-ai-schema";
import { ANALYSIS_INTERVIEW_SCHEMA_VERSION } from "@/lib/analysis/interview/interview-contract";
import {
  createInitialInterview,
  interviewAnswersBridge,
  interviewDynamicContext,
  interviewQuestionFromState,
  interviewUserTurnCount,
  isInterviewSession,
  logInterviewTurnTelemetry,
  packInterview,
  processInterviewAnswer,
  readInterview,
} from "@/lib/analysis/interview/interview-engine";
import { processNativeInterviewAnswer } from "@/lib/analysis/interview/native/native-engine";
import { NATIVE_INTERVIEW_PROMPT_VERSION } from "@/lib/analysis/interview/native/native-contract";
import {
  resolveInterviewEngine,
  resolveNativeInterviewModel,
} from "@/lib/analysis/interview/native/native-path";
import { CHATGPT_CONSULTANT_PROMPT_VERSION } from "@/lib/analysis/interview/chatgpt/chatgpt-contract";
import { processInsightAnswer } from "@/lib/analysis/interview/insight/insight-engine";
import {
  createInsightPreviewSession,
  insightPreviewFingerprint,
  insightPreviewQuestion,
  insightPreviewSpoken,
  isInsightPreviewSession,
  nextInsightQuestionId,
  packInsightPreview,
  readInsightPreview,
  unverifiedInsightOpening,
  type InsightCompressedReport,
} from "@/lib/analysis/insight-preview-bridge";
import { publicUnderstandingSummary } from "@/lib/analysis/interview/understanding-state";
import {
  ANALYSIS_NATIVE_V1_SCHEMA_VERSION,
  compactQuizHistory,
  publicQuizQuestion,
} from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";
import {
  createInitialDynamicQuiz,
  isDynamicQuizSession,
  packDynamicQuiz,
  processDynamicQuizAnswer,
  readDynamicQuiz,
} from "@/lib/analysis/dynamic-quiz/dynamic-quiz-engine";
import { resolveAnalysisProductPath, resolveDynamicQuizModel } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-path";
import { applyInterviewCorrection } from "@/lib/analysis/dynamic-quiz/quiz-prior-lifecycle";
import { isNativeSeedAnswers } from "@/lib/analysis/native-entry";
import { buildNativeLayer2DynamicContext } from "@/lib/analysis/analysis-evidence-authority";

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new AnalysisSessionError("Analysis service unavailable.", 503, "service_unavailable");
  }
  return createSupabaseServiceClient();
}

async function loadQuizContext(quizResultId: string) {
  const supabase = requireService();
  const { data, error } = await supabase
    .from("quiz_results")
    .select(
      `
      id,
      primary_type,
      primary_goal,
      readiness,
      action_history_json,
      quiz_responses ( respondent_name, answers_json )
    `,
    )
    .eq("id", quizResultId)
    .maybeSingle();
  if (error || !data) {
    throw new AnalysisSessionError("Quiz result not found.", 404, "quiz_result_not_found");
  }
  const primaryType = data.primary_type as PersonalityType;
  const actionHistory = Array.isArray(data.action_history_json)
    ? (data.action_history_json as string[])
    : [];
  const responseRaw = data.quiz_responses as unknown;
  const response = (
    Array.isArray(responseRaw) ? responseRaw[0] : responseRaw
  ) as { respondent_name?: string; answers_json?: unknown } | null;
  return {
    primaryType,
    primaryGoal: data.primary_goal ? String(data.primary_goal) : null,
    readiness: data.readiness ? String(data.readiness) : null,
    actionHistoryLabels: actionHistory.map((id) => ACTION_HISTORY_LABELS[id] ?? id),
    respondentName: response?.respondent_name ?? "你",
    nativeSeed: isNativeSeedAnswers(response?.answers_json),
  };
}

function quizSignalsFromContext(quiz: Awaited<ReturnType<typeof loadQuizContext>>) {
  return {
    primaryType: quiz.primaryType,
    primaryGoal: quiz.primaryGoal,
    readiness: quiz.readiness,
    actionHistoryLabels: quiz.actionHistoryLabels,
  };
}

async function persistSessionPatch(
  sessionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = requireService();
  const { error } = await supabase.from("analysis_sessions").update(patch).eq("id", sessionId);
  if (error) {
    throw new AnalysisSessionError("Failed to save analysis.", 500, "persist_failed");
  }
}

function quizForInterview(
  quiz: Awaited<ReturnType<typeof loadQuizContext>>,
  extras?: {
    quizPrior?: unknown;
    quizHistory?: Array<{ question: string; selected: string[] }>;
  },
) {
  const profile = quiz.nativeSeed
    ? { animalName: "", tagline: "", headline: "", coreInsight: "" }
    : getPersonalityProfile(quiz.primaryType);
  return {
    animalName: profile.animalName,
    tagline: profile.tagline,
    headline: profile.headline,
    coreInsight: profile.coreInsight,
    primaryGoal: quiz.nativeSeed ? null : quiz.primaryGoal,
    readiness: quiz.nativeSeed ? null : quiz.readiness,
    quizPrior: extras?.quizPrior,
    quizHistory: extras?.quizHistory,
    nativeSeed: quiz.nativeSeed,
  };
}

export async function startAnalysisIntake(
  token: string,
  options?: {
    interviewPath?: string | null;
    interviewModel?: string | null;
    analysisPath?: string | null;
    quizModel?: string | null;
    consultantVariant?: string | null;
  },
) {
  const row = await requireAnalysisSessionRowByToken(token);
  const state = normalizeAnalysisState(row.analysis_state);
  if (state === "shell") {
    const product = resolveAnalysisProductPath(options?.analysisPath ?? options?.interviewPath);
    if (product === "native_v1") {
      const quiz = createInitialDynamicQuiz(resolveDynamicQuizModel(options?.quizModel));
      await persistSessionPatch(row.id, {
        analysis_state: "questions_in_progress",
        current_question_id: quiz.currentQuestion?.id ?? null,
        intake_schema_version: ANALYSIS_NATIVE_V1_SCHEMA_VERSION,
        answers_json: packDynamicQuiz({}, quiz),
        last_activity_at: new Date().toISOString(),
      });
    } else {
      const engine = product === "legacy" ? "legacy" : resolveInterviewEngine(options?.interviewPath ?? "native");
      const interview = createInitialInterview(
        engine === "native"
          ? {
              engine: "native",
              model: resolveNativeInterviewModel(options?.interviewModel),
              promptVersion: NATIVE_INTERVIEW_PROMPT_VERSION,
            }
          : { engine: "legacy" },
      );
      await persistSessionPatch(row.id, {
        analysis_state: "questions_in_progress",
        current_question_id: interview.currentQuestionId,
        intake_schema_version: ANALYSIS_INTERVIEW_SCHEMA_VERSION,
        answers_json: packInterview({}, interview),
        last_activity_at: new Date().toISOString(),
      });
    }
  }
  return getAnalysisFlowView(token);
}

type InterviewAnswerExtras = {
  timings?: {
    lookupMs?: number;
    loadStateMs?: number;
    compactContextMs?: number;
    openaiDispatchMs?: number;
    openaiMs?: number;
    parseMs?: number;
    groundingMs?: number;
    steeringMs?: number;
    persistMs?: number;
    serializeMs?: number;
    enqueueMs?: number;
    layer1BuildMs?: number;
    totalServerMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    usedLlm?: boolean;
    usedDeterministic?: boolean;
    usedFallback?: boolean;
  };
  interviewDebug?: {
    gap: string;
    sufficiency: Record<string, boolean>;
    reason: string;
    stage: string;
    userQuestion: boolean;
    usedDeterministic?: boolean;
    usedLlm?: boolean;
    understanding: Record<string, { value: string; kind: string }>;
    patch?: {
      facts: Array<{ field: string; value: string }>;
      inferences: Array<{ field: string; value: string; reasoning: string }>;
      rejected: Array<{ field: string; value: string; reason: string }>;
    };
    hypotheses?: Array<{ id: string; claim: string; status: string }>;
    steering?: {
      previous_gap: string;
      newly_confirmed_dimensions: string[];
      invalidated_probe: boolean;
      invalidate_reason: string;
      next_best_gap: string;
      topic_sufficient: boolean;
      topic_sufficient_why: string;
      question_purpose: string;
    } | null;
    coherence?: {
      coherent: boolean;
      references_new_information: boolean;
      serves_current_gap: boolean;
      stale_topic: boolean;
      generic_probe: boolean;
      parroting?: boolean;
      conversation_specific?: boolean;
      rationale: string;
    } | null;
    whyThisQuestionNow?: string | null;
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
    guard?: {
      originalQuestion: string;
      originalResponse: string;
      decision: string;
      replacement: string | null;
      reason: string;
    } | null;
    selfCheck?: { repair: boolean; reasons: string[]; originalQuestion: string | null } | null;
    humanModel?: Record<string, unknown> | null;
    informationValue?: string | null;
    questionNecessary?: { necessary: boolean; reason: string; preferredMove: string } | null;
    visibleTextOwner?: string | null;
    rawResponse?: string | null;
    rawFollowUp?: string | null;
    validation?: { ok: boolean; violations: string[]; interrogativeActs: number; medicalViolation: boolean } | null;
    rawValidation?: { ok: boolean; violations: string[]; interrogativeActs: number; medicalViolation: boolean } | null;
    regenerated?: boolean;
    conversationEngine?: string | null;
    conversationModel?: string | null;
  };
};

export async function submitAnalysisAnswer(input: {
  token: string;
  questionId: string;
  value: unknown;
}): Promise<AnalysisFlowView & InterviewAnswerExtras> {
  const requestStartedAt = Date.now();
  const row = await requireAnalysisSessionRowByToken(input.token);
  const lookupMs = Date.now() - requestStartedAt;
  const state = normalizeAnalysisState(row.analysis_state);
  if (state === "shell") {
    throw new AnalysisSessionError("Start intake first.", 409, "not_started");
  }
  if (
    state === "basic_report_ready" ||
    state === "ai_generating" ||
    state === "ai_ready" ||
    state === "ai_failed" ||
    state === "questions_completed"
  ) {
    return getAnalysisFlowView(input.token);
  }

  const loadStarted = Date.now();
  const quiz = await loadQuizContext(row.quiz_result_id);
  const loadStateMs = Date.now() - loadStarted;
  const answersJson = (row.answers_json as Record<string, unknown> | null) ?? {};
  const dynamicQuiz = readDynamicQuiz(answersJson);
  if (dynamicQuiz && dynamicQuiz.status !== "complete") {
    return submitDynamicQuizAnswer({
      row,
      token: input.token,
      questionId: input.questionId,
      value: input.value,
      quiz,
      answersJson,
      dynamicQuiz,
    });
  }
  if (isInsightPreviewSession(answersJson)) {
    return submitInsightPreviewAnswer({
      row,
      token: input.token,
      questionId: input.questionId,
      value: input.value,
      quiz,
      lookupMs,
      loadStateMs,
      requestStartedAt,
    });
  }
  if (isInterviewSession(answersJson)) {
    return submitInterviewAnswer({
      row,
      token: input.token,
      questionId: input.questionId,
      value: input.value,
      quiz,
      lookupMs,
      loadStateMs,
      requestStartedAt,
    });
  }

  const hydrated = hydrateEngineFromPersisted({
    answersJson,
    currentQuestionId: row.current_question_id,
    quiz: quizSignalsFromContext(quiz),
    analysisState: state,
  });

  const lastAsked = hydrated.engine.askedQuestionIds[hydrated.engine.askedQuestionIds.length - 1];
  const existingValue = lastAsked
    ? (hydrated.answers as Record<string, unknown>)[lastAsked]
    : undefined;
  if (lastAsked === input.questionId && answersEqual(existingValue, input.value)) {
    return getAnalysisFlowView(input.token);
  }

  const expectedId = hydrated.engine.currentQuestionId ?? row.current_question_id;
  if (input.questionId !== expectedId) {
    throw new AnalysisSessionError("Unexpected question.", 409, "question_mismatch");
  }

  const question = resolveAnalysisQuestion(input.questionId);
  if (!question) {
    throw new AnalysisSessionError("Unknown question.", 400, "unknown_question");
  }

  let applied: ReturnType<typeof applyAnalysisAnswer>;
  try {
    applied = applyAnalysisAnswer({
      engine: hydrated.engine,
      answers: hydrated.answers,
      questionId: input.questionId,
      value: input.value,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_answer";
    if (message.startsWith("invalid_answer:")) {
      throw new AnalysisSessionError(message.replace("invalid_answer:", ""), 400, "invalid_answer");
    }
    throw new AnalysisSessionError("Unknown question.", 400, "unknown_question");
  }

  const now = new Date().toISOString();
  const packed = packAnswersWithEngine(applied.answers, applied.engine);

  if (applied.next.kind === "complete") {
    const layer1Started = Date.now();
    const layer1 = buildAnalysisLayer1Report({
      primaryType: quiz.primaryType,
      quizPrimaryGoal: quiz.primaryGoal,
      quizActionHistoryLabels: quiz.actionHistoryLabels,
      quizReadiness: quiz.readiness,
      answers: applied.answers,
      nowIso: now,
      primaryBranch: primaryBranch(applied.engine),
    });
    const layer1BuildMs = Date.now() - layer1Started;

    const enqueueStarted = Date.now();
    await persistSessionPatch(row.id, {
      answers_json: packed,
      current_question_id: null,
      analysis_state: "basic_report_ready",
      intake_schema_version: ANALYSIS_DYNAMIC_SCHEMA_VERSION,
      questions_completed_at: now,
      layer1_json: layer1,
      layer1_ready_at: now,
      last_activity_at: now,
    });

    await enqueueAnalysisAiGeneration({
      sessionId: row.id,
      quizResultId: row.quiz_result_id,
      answers: applied.answers,
      layer1,
      quiz,
      dynamicContext: dynamicContextForReport(applied.engine, applied.answers),
    });
    const enqueueMs = Date.now() - enqueueStarted;
    after(() => {
      void drainAnalysisGenerationQueueWithRetry({ source: "intake_complete" });
    });

    const view = await getAnalysisFlowView(input.token);
    return { ...view, timings: { layer1BuildMs, enqueueMs } };
  }

  await persistSessionPatch(row.id, {
    answers_json: packed,
    current_question_id: applied.engine.currentQuestionId,
    analysis_state: "questions_in_progress",
    intake_schema_version: ANALYSIS_DYNAMIC_SCHEMA_VERSION,
    last_activity_at: now,
  });

  return getAnalysisFlowView(input.token);
}

async function submitDynamicQuizAnswer(input: {
  row: Awaited<ReturnType<typeof requireAnalysisSessionRowByToken>>;
  token: string;
  questionId: string;
  value: unknown;
  quiz: Awaited<ReturnType<typeof loadQuizContext>>;
  answersJson: Record<string, unknown>;
  dynamicQuiz: NonNullable<ReturnType<typeof readDynamicQuiz>>;
}): Promise<AnalysisFlowView & InterviewAnswerExtras> {
  const ice = quizForInterview(input.quiz);
  let processed;
  try {
    processed = await processDynamicQuizAnswer({
      state: input.dynamicQuiz,
      questionId: input.questionId,
      value: input.value,
      icebreaker: {
        animalName: ice.animalName,
        tagline: ice.tagline,
        coreInsight: ice.coreInsight,
        source: input.quiz.nativeSeed ? "native_opener" : "personality_quiz",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_answer";
    if (message.startsWith("invalid_answer:")) {
      throw new AnalysisSessionError(message.replace("invalid_answer:", ""), 400, "invalid_answer");
    }
    if (message === "question_mismatch") {
      throw new AnalysisSessionError("Unexpected question.", 409, "question_mismatch");
    }
    throw new AnalysisSessionError("無法儲存這次回答，請再試一次。", 500, "quiz_failed");
  }

  const now = new Date().toISOString();
  let packed = packDynamicQuiz(input.answersJson, processed.state);

  if (processed.complete) {
    const insight = createInsightPreviewSession();
    packed = packInsightPreview(packed, insight);
    await persistSessionPatch(input.row.id, {
      answers_json: packed,
      current_question_id: insight.currentQuestionId,
      analysis_state: "questions_in_progress",
      intake_schema_version: ANALYSIS_NATIVE_V1_SCHEMA_VERSION,
      last_activity_at: now,
    });
    return getAnalysisFlowView(input.token);
  }

  await persistSessionPatch(input.row.id, {
    answers_json: packed,
    current_question_id: processed.state.currentQuestion?.id ?? null,
    analysis_state: "questions_in_progress",
    intake_schema_version: ANALYSIS_NATIVE_V1_SCHEMA_VERSION,
    last_activity_at: now,
  });
  return getAnalysisFlowView(input.token);
}

function layer1FromInsightPreview(input: {
  quiz: Awaited<ReturnType<typeof loadQuizContext>>;
  hypothesis: string;
  medical: boolean;
  nowIso: string;
  animalName?: string;
}): AnalysisLayer1Report {
  return {
    version: "analysis_layer1_v2",
    generatedAt: input.nowIso,
    grounded: true,
    sections: {
      coreStuck: input.hypothesis.trim() || "我們先把你親口說的內容收進來了。",
      changeState: null,
      progress: ANALYSIS_LAYER1_PROGRESS_COPY,
    },
    facts: {
      personalityType: input.quiz.primaryType,
      animalName: input.animalName || "",
      quizPrimaryGoal: input.quiz.nativeSeed ? null : input.quiz.primaryGoal,
      safetyYes: input.medical,
      commitmentScore: null,
      whyStuckId: null,
      triggerId: null,
      helpWantedId: null,
    },
    safety: {
      flagged: input.medical,
      guidance: input.medical
        ? "健康相關的事我不會幫你下判斷。需要醫療決定時，請找專業人員。"
        : null,
    },
  };
}

async function submitInsightPreviewAnswer(input: {
  row: Awaited<ReturnType<typeof requireAnalysisSessionRowByToken>>;
  token: string;
  questionId: string;
  value: unknown;
  quiz: Awaited<ReturnType<typeof loadQuizContext>>;
  lookupMs: number;
  loadStateMs: number;
  requestStartedAt: number;
}): Promise<AnalysisFlowView & InterviewAnswerExtras> {
  const answersJson = (input.row.answers_json as Record<string, unknown> | null) ?? {};
  let quizState = readDynamicQuiz(answersJson);
  const preview = readInsightPreview(answersJson);
  if (!preview) {
    throw new AnalysisSessionError("Insight session missing.", 409, "not_started");
  }
  if (input.questionId !== preview.currentQuestionId) {
    throw new AnalysisSessionError("Unexpected question.", 409, "question_mismatch");
  }
  const fp = insightPreviewFingerprint(input.questionId, input.value);
  if (preview.lastFingerprint === fp) {
    return getAnalysisFlowView(input.token);
  }

  const payoff = quizState?.payoffAnimal;
  let processed;
  try {
    processed = await processInsightAnswer({
      state: preview.consultant,
      value: String(input.value ?? ""),
      quizPrior: quizState?.prior ?? null,
      quizHistory: quizState ? compactQuizHistory(quizState) : [],
      opening: unverifiedInsightOpening({
        animalName: payoff?.animalName ?? null,
        tagline: payoff?.tagline ?? null,
        coreInsight: payoff?.coreInsight ?? null,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_answer";
    if (message.startsWith("invalid_answer:")) {
      throw new AnalysisSessionError(message.replace("invalid_answer:", ""), 400, "invalid_answer");
    }
    throw new AnalysisSessionError("無法儲存這次回答，請再試一次。", 500, "interview_failed");
  }

  if (quizState?.prior && typeof input.value === "string") {
    const applied = applyInterviewCorrection(quizState.prior, input.value, {
      turn: `user_${processed.state.turns.filter((t) => t.role === "user").length}`,
      existingEvents: quizState.correctionEvents,
    });
    quizState = {
      ...quizState,
      prior: applied.prior,
      lifecycleLog: [...(quizState.lifecycleLog ?? []), ...applied.changes],
      correctionEvents: applied.events,
    };
  }

  const nextPreview = {
    ...preview,
    consultant: processed.state,
    currentQuestionId: processed.complete ? "" : nextInsightQuestionId(processed.state),
    lastFingerprint: fp,
  };
  const packed = packInsightPreview(
    quizState ? packDynamicQuiz(answersJson, quizState) : answersJson,
    nextPreview,
  );
  const now = new Date().toISOString();
  const interviewDebug = {
    gap: "",
    sufficiency: {},
    reason: processed.complete ? "insight_complete" : "insight_turn",
    stage: processed.move,
    userQuestion: false,
    usedLlm: !processed.state.usedFallback,
    usedDeterministic: false,
    understanding: {},
    move: processed.move,
    regenerated: processed.regenerated,
    conversationEngine: "insight",
    conversationModel: processed.state.conversationModel,
  };

  if (processed.complete) {
    const layer1 = layer1FromInsightPreview({
      quiz: input.quiz,
      hypothesis: processed.state.reasoning?.current_best_hypothesis ?? processed.spoken,
      medical: processed.state.safety.userReportedMedical || processed.state.safety.flagged,
      nowIso: now,
      animalName: payoff?.animalName,
    });
    await persistSessionPatch(input.row.id, {
      answers_json: packed,
      current_question_id: null,
      analysis_state: "basic_report_ready",
      intake_schema_version: ANALYSIS_NATIVE_V1_SCHEMA_VERSION,
      questions_completed_at: now,
      layer1_json: layer1,
      layer1_ready_at: now,
      last_activity_at: now,
    });
    await enqueueAnalysisAiGeneration({
      sessionId: input.row.id,
      quizResultId: input.row.quiz_result_id,
      answers:
        processed.state.safety.userReportedMedical || processed.state.safety.flagged
          ? { safety_gate: "yes" }
          : {},
      layer1,
      quiz: input.quiz,
      dynamicContext: {
        primaryBranch: null,
        completedSlots: [],
        activeBranches: [],
        reflections: processed.state.turns
          .filter((t) => t.role === "assistant")
          .slice(-4)
          .map((t) => ({ text: t.text, evidence: [] })),
        derivedFacts: processed.state.reasoning?.current_best_hypothesis
          ? [{ fact: processed.state.reasoning.current_best_hypothesis, inference: true as const, evidence: [] }]
          : [],
        interviewTranscript: processed.state.turns.map((t) => ({ role: t.role, text: t.text })),
        quizPrior: quizState?.prior
          ? {
              unverified: true as const,
              prior: quizState.prior,
              history: compactQuizHistory(quizState),
            }
          : undefined,
        reportKind: "insight_compressed",
        insightReasoning: processed.state.reasoning,
      },
    });
    after(() => {
      void drainAnalysisGenerationQueueWithRetry({ source: "intake_complete" });
    });
    const serializeStarted = Date.now();
    const view = await getAnalysisFlowView(input.token);
    return {
      ...view,
      timings: {
        lookupMs: input.lookupMs,
        loadStateMs: input.loadStateMs,
        openaiMs: processed.openaiMs,
        persistMs: 0,
        serializeMs: Date.now() - serializeStarted,
        totalServerMs: Date.now() - input.requestStartedAt,
        inputTokens: processed.inputTokens,
        outputTokens: processed.outputTokens,
        usedLlm: !processed.state.usedFallback,
        usedFallback: processed.state.usedFallback,
      },
      interviewDebug,
    };
  }

  await persistSessionPatch(input.row.id, {
    answers_json: packed,
    current_question_id: nextPreview.currentQuestionId,
    analysis_state: "questions_in_progress",
    intake_schema_version: ANALYSIS_NATIVE_V1_SCHEMA_VERSION,
    last_activity_at: now,
  });
  const serializeStarted = Date.now();
  const view = buildInsightPreviewFlowView({
    row: input.row,
    quiz: input.quiz,
    preview: nextPreview,
    analysisState: "questions_in_progress",
    layer1: (input.row.layer1_json as AnalysisLayer1Report | null) ?? null,
    questionsCompletedAt: input.row.questions_completed_at ?? null,
    layer1ReadyAt: input.row.layer1_ready_at ?? null,
  });
  return {
    ...view,
    timings: {
      lookupMs: input.lookupMs,
      loadStateMs: input.loadStateMs,
      openaiMs: processed.openaiMs,
      persistMs: Date.now() - input.requestStartedAt,
      serializeMs: Date.now() - serializeStarted,
      totalServerMs: Date.now() - input.requestStartedAt,
      inputTokens: processed.inputTokens,
      outputTokens: processed.outputTokens,
      usedLlm: !processed.state.usedFallback,
      usedFallback: processed.state.usedFallback,
    },
    interviewDebug,
  };
}

async function submitInterviewAnswer(input: {
  row: Awaited<ReturnType<typeof requireAnalysisSessionRowByToken>>;
  token: string;
  questionId: string;
  value: unknown;
  quiz: Awaited<ReturnType<typeof loadQuizContext>>;
  lookupMs: number;
  loadStateMs: number;
  requestStartedAt: number;
}): Promise<AnalysisFlowView & InterviewAnswerExtras> {
  const answersJson = (input.row.answers_json as Record<string, unknown> | null) ?? {};
  let quizState = readDynamicQuiz(answersJson);
  const interview = readInterview(answersJson);
  if (!interview) {
    throw new AnalysisSessionError("Interview session missing.", 409, "not_started");
  }

  let processed;
  try {
    const native = interview.conversationEngine === "native";
    const quizCtx = quizForInterview(input.quiz, {
      quizPrior: quizState?.prior ?? null,
      quizHistory: quizState ? compactQuizHistory(quizState) : [],
    });
    processed = native
      ? await processNativeInterviewAnswer({
          state: interview,
          questionId: input.questionId,
          value: input.value,
          quiz: quizCtx,
          consultantVariant:
            interview.promptVersion === CHATGPT_CONSULTANT_PROMPT_VERSION ? "chatgpt" : "current",
        })
      : await processInterviewAnswer({
          state: interview,
          questionId: input.questionId,
          value: input.value,
          quiz: quizCtx,
        });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_answer";
    if (message.startsWith("invalid_answer:")) {
      throw new AnalysisSessionError(message.replace("invalid_answer:", ""), 400, "invalid_answer");
    }
    if (message === "question_mismatch") {
      throw new AnalysisSessionError("Unexpected question.", 409, "question_mismatch");
    }
    throw new AnalysisSessionError("無法儲存這次回答，請再試一次。", 500, "interview_failed");
  }

  logInterviewTurnTelemetry({
    userTurns: interviewUserTurnCount(processed.state),
    latencyMs: processed.latencyMs,
    openaiMs: processed.timings.openaiMs,
    parseMs: processed.timings.parseMs,
    inputTokens: processed.inputTokens,
    outputTokens: processed.outputTokens,
    usedFallback: processed.usedFallback,
    usedLlm: processed.timings.usedLlm,
    usedDeterministic: processed.timings.usedDeterministic,
    complete: processed.complete,
    stage: processed.state.understanding.conversation_stage,
    aiCallCount: processed.state.aiCallCount,
    gap: processed.debug.gap,
  });

  const now = new Date().toISOString();
  if (quizState?.prior && typeof input.value === "string") {
    const applied = applyInterviewCorrection(quizState.prior, input.value, {
      turn: `user_${interviewUserTurnCount(processed.state)}`,
      existingEvents: quizState.correctionEvents,
    });
    quizState = {
      ...quizState,
      prior: applied.prior,
      lifecycleLog: [...(quizState.lifecycleLog ?? []), ...applied.changes],
      correctionEvents: applied.events,
    };
  }
  const bridged = interviewAnswersBridge(processed.state);
  const packed = packInterview(
    quizState ? packDynamicQuiz({ ...(bridged as Record<string, unknown>) }, quizState) : { ...(bridged as Record<string, unknown>) },
    processed.state,
  );
  const schemaVersion = quizState ? ANALYSIS_NATIVE_V1_SCHEMA_VERSION : ANALYSIS_INTERVIEW_SCHEMA_VERSION;
  const interviewDebug = {
    gap: processed.debug.gap,
    sufficiency: processed.debug.sufficiency,
    reason: processed.debug.reason,
    stage: processed.debug.stage,
    userQuestion: processed.debug.userQuestion,
    usedDeterministic: processed.debug.usedDeterministic,
    usedLlm: processed.debug.usedLlm,
    understanding: publicUnderstandingSummary(processed.state.understanding),
    patch: processed.debug.patch,
    hypotheses: (processed.state.understanding.hypotheses ?? []).map((h) => ({
      id: h.id,
      claim: h.claim,
      status: h.status,
    })),
    steering: processed.debug.steering,
    coherence: processed.debug.coherence,
    whyThisQuestionNow: processed.debug.whyThisQuestionNow,
    move: processed.debug.move ?? null,
    reasoningSummary: processed.debug.reasoningSummary ?? null,
    novelty: processed.debug.novelty,
    pivot: processed.debug.pivot ?? null,
    guard: processed.debug.guard ?? null,
    selfCheck: processed.debug.selfCheck ?? null,
    humanModel: processed.debug.humanModel ?? null,
    informationValue: processed.debug.informationValue ?? null,
    questionNecessary: processed.debug.questionNecessary ?? null,
    visibleTextOwner: processed.debug.visibleTextOwner ?? null,
    rawResponse: processed.debug.rawResponse ?? null,
    rawFollowUp: processed.debug.rawFollowUp ?? null,
    validation: processed.debug.validation ?? null,
    rawValidation: processed.debug.rawValidation ?? null,
    regenerated: processed.debug.regenerated ?? false,
    conversationEngine: processed.state.conversationEngine ?? interview.conversationEngine ?? "legacy",
    conversationModel: processed.state.conversationModel ?? interview.conversationModel ?? null,
  };

  const baseTimings = {
    lookupMs: input.lookupMs,
    loadStateMs: input.loadStateMs,
    compactContextMs: processed.timings.compactContextMs,
    openaiDispatchMs: processed.timings.openaiDispatchMs,
    openaiMs: processed.timings.openaiMs,
    parseMs: processed.timings.parseMs,
    groundingMs: processed.timings.groundingMs,
    steeringMs: processed.timings.steeringMs,
    inputTokens: processed.inputTokens,
    outputTokens: processed.outputTokens,
    usedLlm: processed.timings.usedLlm,
    usedDeterministic: processed.timings.usedDeterministic,
    usedFallback: processed.timings.usedFallback,
  };

  if (processed.debug.reason === "idempotent") {
    const serializeStarted = Date.now();
    const view = buildInterviewFlowView({
      row: input.row,
      quiz: input.quiz,
      interview: processed.state,
      analysisState: processed.complete ? "basic_report_ready" : "questions_in_progress",
      layer1: (input.row.layer1_json as AnalysisLayer1Report | null) ?? null,
      questionsCompletedAt: input.row.questions_completed_at ?? null,
      layer1ReadyAt: input.row.layer1_ready_at ?? null,
    });
    return {
      ...view,
      timings: {
        ...baseTimings,
        persistMs: 0,
        serializeMs: Date.now() - serializeStarted,
        totalServerMs: Date.now() - input.requestStartedAt,
      },
      interviewDebug,
    };
  }

  if (processed.complete) {
    const layer1Started = Date.now();
    const layer1 = buildAnalysisLayer1Report({
      primaryType: input.quiz.primaryType,
      quizPrimaryGoal: input.quiz.primaryGoal,
      quizActionHistoryLabels: input.quiz.actionHistoryLabels,
      quizReadiness: input.quiz.readiness,
      answers: bridged,
      nowIso: now,
      understanding: processed.state.understanding,
    });
    const layer1BuildMs = Date.now() - layer1Started;
    const persistStarted = Date.now();
    await persistSessionPatch(input.row.id, {
      answers_json: packed,
      current_question_id: null,
      analysis_state: "basic_report_ready",
      intake_schema_version: schemaVersion,
      questions_completed_at: now,
      layer1_json: layer1,
      layer1_ready_at: now,
      last_activity_at: now,
    });
    const persistMs = Date.now() - persistStarted;
    const enqueueStarted = Date.now();
    const interviewCtx = interviewDynamicContext(processed.state);
    await enqueueAnalysisAiGeneration({
      sessionId: input.row.id,
      quizResultId: input.row.quiz_result_id,
      answers: bridged,
      layer1,
      quiz: input.quiz,
      dynamicContext: buildNativeLayer2DynamicContext({
        quizState,
        interviewState: processed.state,
        extra: {
          primaryBranch: interviewCtx?.primaryBranch ?? null,
          completedSlots: interviewCtx?.completedSlots ?? [],
          activeBranches: interviewCtx?.activeBranches ?? [],
          reflections: interviewCtx?.reflections ?? [],
          derivedFacts: interviewCtx?.derivedFacts ?? [],
          understanding: interviewCtx?.understanding,
          conversationStage: interviewCtx?.conversationStage,
        },
      }),
    });
    const enqueueMs = Date.now() - enqueueStarted;
    after(() => {
      void drainAnalysisGenerationQueueWithRetry({ source: "intake_complete" });
    });
    const serializeStarted = Date.now();
    const view = buildInterviewFlowView({
      row: input.row,
      quiz: input.quiz,
      interview: processed.state,
      analysisState: "basic_report_ready",
      layer1,
      questionsCompletedAt: now,
      layer1ReadyAt: now,
    });
    return {
      ...view,
      timings: {
        ...baseTimings,
        layer1BuildMs,
        enqueueMs,
        persistMs,
        serializeMs: Date.now() - serializeStarted,
        totalServerMs: Date.now() - input.requestStartedAt,
      },
      interviewDebug,
    };
  }

  const persistStarted = Date.now();
  await persistSessionPatch(input.row.id, {
    answers_json: packed,
    current_question_id: processed.state.currentQuestionId,
    analysis_state: "questions_in_progress",
    intake_schema_version: schemaVersion,
    last_activity_at: now,
  });
  const persistMs = Date.now() - persistStarted;
  const serializeStarted = Date.now();
  const view = buildInterviewFlowView({
    row: input.row,
    quiz: input.quiz,
    interview: processed.state,
    analysisState: "questions_in_progress",
    layer1: (input.row.layer1_json as AnalysisLayer1Report | null) ?? null,
    questionsCompletedAt: input.row.questions_completed_at ?? null,
    layer1ReadyAt: input.row.layer1_ready_at ?? null,
  });
  return {
    ...view,
    timings: {
      ...baseTimings,
      persistMs,
      serializeMs: Date.now() - serializeStarted,
      totalServerMs: Date.now() - input.requestStartedAt,
    },
    interviewDebug,
  };
}

export type AnalysisFlowView = {
  status: string;
  analysisState: AnalysisState;
  expiresAt: string;
  quizSummary: {
    resultId: string;
    respondentName: string;
    primaryType: string;
    animalName: string;
    tagline: string;
    headline: string;
    coreInsight: string;
    entryKind?: "native_seed" | "personality_quiz";
    animalPayoffUnverified?: boolean;
  };
  progress: { current: number; total: number } | null;
  currentQuestion: ReturnType<typeof resolveAnalysisQuestion> | ReturnType<typeof interviewQuestionFromState> | {
    id: string;
    type: string;
    prompt: string;
    options: Array<{ id: string; label: string }>;
  } | null;
  reflection: Pick<AnalysisReflection, "kicker" | "text"> | null;
  interviewMode: boolean;
  phase: "quiz" | "interview" | "report";
  assistantResponse: string | null;
  singleUtterance: boolean;
  answers: AnalysisIntakeAnswers;
  layer1: AnalysisLayer1Report | null;
  aiReport: AnalysisAiReport | InsightCompressedReport | null;
  aiStatus: string | null;
  aiStartedAt: string | null;
  aiCompletedAt: string | null;
  aiModel: string | null;
  questionsCompletedAt: string | null;
  layer1ReadyAt: string | null;
  progressStages: ReturnType<typeof resolveDynamicMilestones> | ReturnType<typeof resolveAnalysisProgressStages>;
  canLeaveMessage: string;
  conversationRuntime?: "insight_v1" | "chatgpt" | "native" | "legacy";
};

function publicReflection(engine: AnalysisEngineState): Pick<AnalysisReflection, "kicker" | "text"> | null {
  if (!engine.lastReflection) return null;
  return { kicker: engine.lastReflection.kicker, text: engine.lastReflection.text };
}

function quizSummaryFromContext(
  quizResultId: string,
  quiz: Awaited<ReturnType<typeof loadQuizContext>>,
  payoffAnimal?: {
    animalName: string;
    tagline: string;
    headline: string;
    coreInsight: string;
    type?: string;
  } | null,
) {
  if (quiz.nativeSeed && payoffAnimal?.animalName) {
    return {
      resultId: quizResultId,
      respondentName: quiz.respondentName,
      primaryType: payoffAnimal.type ?? "",
      animalName: payoffAnimal.animalName,
      tagline: payoffAnimal.tagline,
      headline: payoffAnimal.headline,
      coreInsight: payoffAnimal.coreInsight,
      entryKind: "native_seed" as const,
      animalPayoffUnverified: true as const,
    };
  }
  const profile = quiz.nativeSeed
    ? { animalName: "", tagline: "", headline: "", coreInsight: "" }
    : getPersonalityProfile(quiz.primaryType);
  return {
    resultId: quizResultId,
    respondentName: quiz.respondentName,
    primaryType: quiz.nativeSeed ? "" : quiz.primaryType,
    animalName: profile.animalName,
    tagline: profile.tagline,
    headline: profile.headline,
    coreInsight: profile.coreInsight,
    entryKind: quiz.nativeSeed ? ("native_seed" as const) : ("personality_quiz" as const),
  };
}

function canLeaveCopy(state: AnalysisState): string {
  if (state === "ai_generating" || state === "basic_report_ready") {
    return "你可以先看即時整理；完整個人分析完成後會自動更新。也可以先離開，稍後再回來。";
  }
  if (state === "ai_ready") {
    return "這份分析會保留在這個連結，之後回來還看得到。";
  }
  return "你可以先離開，完成後回來結果還會在這裡。";
}

function buildInterviewFlowView(input: {
  row: Awaited<ReturnType<typeof requireAnalysisSessionRowByToken>>;
  quiz: Awaited<ReturnType<typeof loadQuizContext>>;
  interview: NonNullable<ReturnType<typeof readInterview>>;
  analysisState: AnalysisState;
  layer1: AnalysisLayer1Report | null;
  questionsCompletedAt: string | null;
  layer1ReadyAt: string | null;
  aiReport?: AnalysisAiReport | InsightCompressedReport | null;
  aiStatus?: string | null;
  aiStartedAt?: string | null;
  aiCompletedAt?: string | null;
  aiModel?: string | null;
}): AnalysisFlowView {
  const asking = input.analysisState === "questions_in_progress";
  return {
    status: String(input.row.status),
    analysisState: input.analysisState,
    expiresAt: input.row.expires_at,
    quizSummary: quizSummaryFromContext(
      input.row.quiz_result_id,
      input.quiz,
      readDynamicQuiz((input.row.answers_json as Record<string, unknown> | null) ?? {})?.payoffAnimal,
    ),
    progress: null,
    currentQuestion: asking ? interviewQuestionFromState(input.interview) : null,
    reflection:
      asking && input.interview.pendingAssistant.response
        ? { kicker: "", text: input.interview.pendingAssistant.response }
        : null,
    interviewMode: true,
    phase: asking ? "interview" : "report",
    assistantResponse: input.interview.pendingAssistant.response || null,
    singleUtterance: input.interview.conversationEngine === "native",
    answers: interviewAnswersBridge(input.interview),
    layer1: input.layer1,
    aiReport: input.aiReport ?? null,
    aiStatus: input.aiStatus ?? null,
    aiStartedAt: input.aiStartedAt ?? null,
    aiCompletedAt: input.aiCompletedAt ?? null,
    aiModel: input.aiModel ?? null,
    questionsCompletedAt: input.questionsCompletedAt,
    layer1ReadyAt: input.layer1ReadyAt,
    progressStages: resolveAnalysisProgressStages({
      analysisState: input.analysisState,
      hasLayer1: Boolean(input.layer1),
    }),
    canLeaveMessage: canLeaveCopy(input.analysisState),
    conversationRuntime:
      input.interview.promptVersion === CHATGPT_CONSULTANT_PROMPT_VERSION
        ? "chatgpt"
        : input.interview.conversationEngine === "native"
          ? "native"
          : "legacy",
  };
}

function buildInsightPreviewFlowView(input: {
  row: Awaited<ReturnType<typeof requireAnalysisSessionRowByToken>>;
  quiz: Awaited<ReturnType<typeof loadQuizContext>>;
  preview: NonNullable<ReturnType<typeof readInsightPreview>>;
  analysisState: AnalysisState;
  layer1: AnalysisLayer1Report | null;
  questionsCompletedAt: string | null;
  layer1ReadyAt: string | null;
  aiReport?: AnalysisAiReport | InsightCompressedReport | null;
  aiStatus?: string | null;
  aiStartedAt?: string | null;
  aiCompletedAt?: string | null;
  aiModel?: string | null;
}): AnalysisFlowView {
  const asking = input.analysisState === "questions_in_progress";
  return {
    status: String(input.row.status),
    analysisState: input.analysisState,
    expiresAt: input.row.expires_at,
    quizSummary: quizSummaryFromContext(
      input.row.quiz_result_id,
      input.quiz,
      readDynamicQuiz((input.row.answers_json as Record<string, unknown> | null) ?? {})?.payoffAnimal,
    ),
    progress: null,
    currentQuestion: asking ? insightPreviewQuestion(input.preview) : null,
    reflection: null,
    interviewMode: true,
    phase: asking ? "interview" : "report",
    assistantResponse: asking ? insightPreviewSpoken(input.preview) : input.preview.consultant.pendingResponse || null,
    singleUtterance: true,
    answers: {},
    layer1: input.layer1,
    aiReport: input.aiReport ?? null,
    aiStatus: input.aiStatus ?? null,
    aiStartedAt: input.aiStartedAt ?? null,
    aiCompletedAt: input.aiCompletedAt ?? null,
    aiModel: input.aiModel ?? null,
    questionsCompletedAt: input.questionsCompletedAt,
    layer1ReadyAt: input.layer1ReadyAt,
    progressStages: resolveAnalysisProgressStages({
      analysisState: input.analysisState,
      hasLayer1: Boolean(input.layer1),
    }),
    canLeaveMessage: canLeaveCopy(input.analysisState),
    conversationRuntime: "insight_v1",
  };
}

async function loadAnalysisReport(reportId: string): Promise<{
  aiReport: AnalysisAiReport | InsightCompressedReport | null;
  aiStatus: string | null;
  aiStartedAt: string | null;
  aiCompletedAt: string | null;
  aiModel: string | null;
}> {
  const supabase = requireService();
  const { data } = await supabase
    .from("analysis_reports")
    .select("status, output_json, started_at, completed_at, model")
    .eq("id", reportId)
    .maybeSingle();
  return {
    aiStatus: data?.status ?? null,
    aiStartedAt: data?.started_at ?? null,
    aiCompletedAt: data?.completed_at ?? null,
    aiModel: data?.model ?? null,
    aiReport:
      data?.status === "completed" && data.output_json
        ? (data.output_json as AnalysisAiReport | InsightCompressedReport)
        : null,
  };
}

export async function getAnalysisFlowView(token: string): Promise<AnalysisFlowView> {
  const row = await requireAnalysisSessionRowByToken(token);
  const state = normalizeAnalysisState(row.analysis_state);
  const [quiz, report] = await Promise.all([
    loadQuizContext(row.quiz_result_id),
    row.report_id
      ? loadAnalysisReport(row.report_id)
      : Promise.resolve({
          aiReport: null,
          aiStatus: null,
          aiStartedAt: null,
          aiCompletedAt: null,
          aiModel: null,
        }),
  ]);
  after(() => {
    void touchAnalysisSession(row.id).catch(() => undefined);
  });

  const answersJson = (row.answers_json as Record<string, unknown> | null) ?? {};
  const layer1 = (row.layer1_json as AnalysisLayer1Report | null) ?? null;
  const dynamicQuiz = readDynamicQuiz(answersJson);

  if (dynamicQuiz && dynamicQuiz.status !== "complete") {
    const publicQ = publicQuizQuestion(dynamicQuiz);
    return {
      status: String(row.status),
      analysisState: state,
      expiresAt: row.expires_at,
      quizSummary: quizSummaryFromContext(row.quiz_result_id, quiz, dynamicQuiz?.payoffAnimal),
      progress: null,
      currentQuestion: publicQ
        ? { id: publicQ.id, type: publicQ.type, prompt: publicQ.prompt, options: publicQ.options }
        : null,
      reflection: null,
      interviewMode: false,
      phase: "quiz",
      assistantResponse: null,
      singleUtterance: false,
      answers: {},
      layer1,
      ...report,
      questionsCompletedAt: row.questions_completed_at ?? null,
      layer1ReadyAt: row.layer1_ready_at ?? null,
      progressStages: [{ id: "goal_understood", label: "正在更了解你", done: false, active: true }],
      canLeaveMessage: canLeaveCopy(state),
    };
  }

  if (isInsightPreviewSession(answersJson)) {
    const preview = readInsightPreview(answersJson)!;
    return buildInsightPreviewFlowView({
      row,
      quiz,
      preview,
      analysisState: state,
      layer1,
      questionsCompletedAt: row.questions_completed_at ?? null,
      layer1ReadyAt: row.layer1_ready_at ?? null,
      ...report,
    });
  }

  if (isInterviewSession(answersJson)) {
    const interview = readInterview(answersJson)!;
    return buildInterviewFlowView({
      row,
      quiz,
      interview,
      analysisState: state,
      layer1,
      questionsCompletedAt: row.questions_completed_at ?? null,
      layer1ReadyAt: row.layer1_ready_at ?? null,
      ...report,
    });
  }

  const hydrated = hydrateEngineFromPersisted({
    answersJson,
    currentQuestionId: row.current_question_id,
    quiz: quizSignalsFromContext(quiz),
    analysisState: state,
  });
  const currentQuestionId =
    state === "questions_in_progress"
      ? hydrated.engine.currentQuestionId ?? row.current_question_id
      : null;
  const progressStages = resolveDynamicMilestones({
    engine: hydrated.engine,
    analysisState: state,
    hasLayer1: Boolean(layer1),
  });

  return {
    status: String(row.status),
    analysisState: state,
    expiresAt: row.expires_at,
    quizSummary: quizSummaryFromContext(row.quiz_result_id, quiz, dynamicQuiz?.payoffAnimal),
    progress: null,
    currentQuestion: currentQuestionId ? resolveAnalysisQuestion(currentQuestionId) : null,
    reflection: state === "questions_in_progress" ? publicReflection(hydrated.engine) : null,
    interviewMode: false,
    phase: state === "questions_in_progress" ? "quiz" : "report",
    assistantResponse: null,
    singleUtterance: false,
    answers: hydrated.answers,
    layer1,
    ...report,
    questionsCompletedAt: row.questions_completed_at ?? null,
    layer1ReadyAt: row.layer1_ready_at ?? null,
    progressStages,
    canLeaveMessage: canLeaveCopy(state),
  };
}

export function fingerprintAnalysisInput(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export { ANALYSIS_QUESTIONS };
export type { AnalysisEngineState };
