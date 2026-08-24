import { after } from "next/server";
import { logLlmCall } from "@/lib/ai/llm-telemetry";
import {
  AnalysisSessionError,
  createNativeAnalysisSession,
  requireAnalysisSessionRowByToken,
} from "@/lib/analysis/analysis-session-service";
import {
  animalCopyFor,
  compactQuizBackground,
  RESET_QUIZ_QUESTIONS,
  RESET_QUIZ_VERSION,
  resolveResetQuizAnswer,
  scoreResetQuiz,
} from "@/lib/analysis/reset/reset-quiz";
import {
  createInitialResetSession,
  isResetSession,
  openingAssistantTurn,
  packResetSession,
  readResetSession,
  toPublicView,
  type ResetPublicView,
  type ResetSession,
} from "@/lib/analysis/reset/reset-contract";
import { processResetConversationAnswer, RESET_MEDICAL_GUIDANCE } from "@/lib/analysis/reset/reset-engine";
import { generateResetReport } from "@/lib/analysis/reset/reset-report";
import {
  RESET_CONVERSATION_PROMPT_VERSION,
  RESET_ENTRY,
  RESET_MODEL,
  RESET_REPORT_PROMPT_VERSION,
  RESET_SCHEMA_VERSION,
  isResetPreviewAllowed,
} from "@/lib/analysis/reset/reset-path";
import {
  attachPublicHandoff,
  getInterestBySessionId,
  record21dFunnelEvent,
  request21dInterest,
  toPublicHandoff,
} from "@/lib/analysis/handoff/experience-21d-service";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new AnalysisSessionError("Analysis service unavailable.", 503, "service_unavailable");
  }
  return createSupabaseServiceClient();
}

function requirePreview() {
  if (!isResetPreviewAllowed()) {
    throw new AnalysisSessionError("not_found", 404, "not_found");
  }
}

async function persist(sessionId: string, session: ResetSession, extra?: Record<string, unknown>) {
  const supabase = requireService();
  const now = new Date().toISOString();
  const analysisState =
    session.act === "report" && session.report
      ? "ai_ready"
      : session.conversation.complete
        ? "ai_generating"
        : "questions_in_progress";
  const { error } = await supabase
    .from("analysis_sessions")
    .update({
      answers_json: packResetSession(session),
      current_question_id:
        session.act === "quiz" ? session.quiz.currentQuestionId : session.act === "conversation" ? "rx_chat" : null,
      analysis_state: analysisState,
      intake_schema_version: RESET_SCHEMA_VERSION,
      last_activity_at: now,
      questions_completed_at: session.conversation.complete ? now : null,
      ...extra,
    })
    .eq("id", sessionId);
  if (error) {
    throw new AnalysisSessionError("Failed to save analysis.", 500, "persist_failed");
  }
}

async function publicExperience(sessionId: string, session: ResetSession): Promise<ResetPublicView> {
  const view = toPublicView(session);
  if (session.act !== "report" || !session.report) return view;
  const interest = await getInterestBySessionId(sessionId);
  await record21dFunnelEvent({ analysisSessionId: sessionId, event: "report_viewed" });
  await record21dFunnelEvent({ analysisSessionId: sessionId, event: "21d_offer_viewed" });
  return attachPublicHandoff(view, toPublicHandoff(session, interest));
}

function logResetLlm(input: {
  pointKey: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}) {
  const run = () => {
    void logLlmCall({
      feature: "analysis",
      pointKey: input.pointKey,
      customerId: null,
      enrollmentId: null,
      ownerMemberId: null,
      model: RESET_MODEL,
      promptVersion: input.promptVersion,
      usage: {
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cachedInputTokens: 0,
        imageCount: 0,
      },
      latencyMs: input.latencyMs,
      status: "completed",
    }).catch(() => undefined);
  };
  try {
    after(run);
  } catch {
    run();
  }
}

export async function createResetPreviewSession(input: {
  referralShareToken?: string | null;
  radarCandidateId?: string | null;
  shareCode?: string | null;
  resultShareCode?: string | null;
}) {
  requirePreview();
  const created = await createNativeAnalysisSession({
    referralShareToken: input.referralShareToken,
    radarCandidateId: input.radarCandidateId,
    shareCode: input.shareCode,
    resultShareCode: input.resultShareCode,
  });
  const session = createInitialResetSession();
  await persist(created.session.id, session);
  return {
    token: created.plaintextToken,
    expiresAt: created.session.expiresAt,
    entry: RESET_ENTRY,
    experience: toPublicView(session),
  };
}

export async function getResetExperience(
  token: string,
): Promise<{ kind: "reset"; experience: ResetPublicView } | { kind: "legacy" }> {
  requirePreview();
  const row = await requireAnalysisSessionRowByToken(token);
  const answers = (row.answers_json as Record<string, unknown> | null) ?? {};
  if (!isResetSession(answers)) return { kind: "legacy" };
  const session = readResetSession(answers)!;
  if (session.conversation.complete && !session.report) {
    try {
      return { kind: "reset", experience: (await ensureResetReport(token, session, row.id)).experience };
    } catch {
      return { kind: "reset", experience: await publicExperience(row.id, session) };
    }
  }
  return { kind: "reset", experience: await publicExperience(row.id, session) };
}

async function loadReset(token: string): Promise<{ row: Awaited<ReturnType<typeof requireAnalysisSessionRowByToken>>; session: ResetSession }> {
  requirePreview();
  const row = await requireAnalysisSessionRowByToken(token);
  const session = readResetSession((row.answers_json as Record<string, unknown> | null) ?? {});
  if (!session) throw new AnalysisSessionError("Reset session missing.", 409, "not_started");
  return { row, session };
}

export async function submitResetQuizAnswer(input: {
  token: string;
  questionId: string;
  optionId: string;
}): Promise<ResetPublicView> {
  const { row, session } = await loadReset(input.token);
  if (session.act !== "quiz") {
    return toPublicView(session);
  }
  if (input.questionId !== session.quiz.currentQuestionId) {
    throw new AnalysisSessionError("Unexpected question.", 409, "question_mismatch");
  }
  const question = RESET_QUIZ_QUESTIONS.find((q) => q.id === input.questionId);
  const resolved = resolveResetQuizAnswer({ questionId: input.questionId, selectedOptionId: input.optionId });
  if (!question || !resolved) {
    throw new AnalysisSessionError("Unknown option.", 400, "invalid_answer");
  }
  const answers = [...session.quiz.answers, resolved];
  if (answers.length >= RESET_QUIZ_QUESTIONS.length) {
    const scored = scoreResetQuiz(answers);
    const next: ResetSession = {
      ...session,
      act: "reveal",
      quiz: {
        version: RESET_QUIZ_VERSION,
        answers,
        currentQuestionId: "",
        result: scored,
      },
      animal: animalCopyFor(scored.primaryType),
    };
    await persist(row.id, next);
    return toPublicView(next);
  }
  const nextQuestion = RESET_QUIZ_QUESTIONS[answers.length]!;
  const next: ResetSession = {
    ...session,
    quiz: {
      version: RESET_QUIZ_VERSION,
      answers,
      currentQuestionId: nextQuestion.id,
      result: null,
    },
  };
  await persist(row.id, next);
  return toPublicView(next);
}

export async function startResetConversation(token: string): Promise<ResetPublicView> {
  const { row, session } = await loadReset(token);
  if (session.act === "conversation" || session.act === "report") {
    return toPublicView(session);
  }
  if (session.act !== "reveal" || !session.animal) {
    throw new AnalysisSessionError("Finish the quiz first.", 409, "not_started");
  }
  const next: ResetSession = {
    ...session,
    act: "conversation",
    conversation: {
      ...session.conversation,
      turns: [openingAssistantTurn()],
    },
  };
  await persist(row.id, next);
  return toPublicView(next);
}

export async function submitResetConversationAnswer(input: {
  token: string;
  value: string;
}): Promise<ResetPublicView & { openaiMs?: number }> {
  const { row, session } = await loadReset(input.token);
  if (session.act !== "conversation" || session.conversation.complete) {
    return toPublicView(session);
  }
  const background = session.quiz.result
    ? compactQuizBackground(session.quiz.result)
    : session.animal
      ? compactQuizBackground(session.animal)
      : "UNVERIFIED QUIZ BACKGROUND: none.";
  let processed;
  try {
    processed = await processResetConversationAnswer({
      conversation: session.conversation,
      value: input.value,
      compactQuizBackground: background,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "interview_failed";
    if (message.startsWith("invalid_answer:")) {
      throw new AnalysisSessionError(message.replace("invalid_answer:", ""), 400, "invalid_answer");
    }
    throw new AnalysisSessionError("無法儲存這次回答，請再試一次。", 500, "interview_failed");
  }

  let next: ResetSession = {
    ...session,
    conversation: processed.conversation,
    usage: {
      ...session.usage,
      conversationInputTokens: session.usage.conversationInputTokens + processed.inputTokens,
      conversationOutputTokens: session.usage.conversationOutputTokens + processed.outputTokens,
      conversationLatenciesMs: [...session.usage.conversationLatenciesMs, processed.openaiMs],
    },
    safety: processed.medical
      ? { flagged: true, guidance: RESET_MEDICAL_GUIDANCE }
      : session.safety,
  };

  logResetLlm({
    pointKey: "reset_conversation",
    promptVersion: RESET_CONVERSATION_PROMPT_VERSION,
    inputTokens: processed.inputTokens,
    outputTokens: processed.outputTokens,
    latencyMs: processed.openaiMs,
  });

  if (processed.conversation.complete) {
    next = await attachReport(next);
  }
  await persist(row.id, next);
  return publicExperience(row.id, next);
}

async function attachReport(session: ResetSession): Promise<ResetSession> {
  const background = session.quiz.result
    ? compactQuizBackground(session.quiz.result)
    : "UNVERIFIED QUIZ BACKGROUND: none.";
  const generated = await generateResetReport({
    transcript: session.conversation.turns,
    compactQuizBackground: background,
  });
  logResetLlm({
    pointKey: "reset_report",
    promptVersion: RESET_REPORT_PROMPT_VERSION,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
    latencyMs: generated.openaiMs,
  });
  return {
    ...session,
    act: "report",
    report: generated.report,
    usage: {
      ...session.usage,
      reportInputTokens: generated.inputTokens,
      reportOutputTokens: generated.outputTokens,
      reportLatencyMs: generated.openaiMs,
    },
  };
}

async function ensureResetReport(
  _token: string,
  session: ResetSession,
  sessionId: string,
): Promise<{ experience: ResetPublicView }> {
  if (session.report) return { experience: await publicExperience(sessionId, session) };
  const next = await attachReport(session);
  await persist(sessionId, next);
  return { experience: await publicExperience(sessionId, next) };
}

export async function submitReset21dInterest(input: {
  token: string;
  displayName?: string | null;
  channel?: string | null;
  value?: string | null;
}): Promise<ResetPublicView> {
  const { row, session } = await loadReset(input.token);
  const result = await request21dInterest({
    analysisSessionId: row.id,
    session,
    contact: {
      displayName: input.displayName,
      channel: input.channel,
      value: input.value,
    },
  });
  return attachPublicHandoff(toPublicView(session), result.public);
}
