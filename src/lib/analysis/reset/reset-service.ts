import { after } from "next/server";
import { logLlmCall } from "@/lib/ai/llm-telemetry";
import {
  AnalysisSessionError,
  requireAnalysisSessionRowByToken,
} from "@/lib/analysis/analysis-session-service";
import {
  ANALYSIS_SESSION_TTL_DAYS,
  resolveAnalysisAttribution,
} from "@/lib/analysis/analysis-attribution";
import {
  generateAnalysisSessionToken,
  hashAnalysisSessionToken,
} from "@/lib/analysis/analysis-session-token";
import { resolveValidatedGrowthShareId } from "@/lib/analysis/resolve-growth-share";
import { NATIVE_V1_SEED_KEY } from "@/lib/analysis/native-entry";
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
import { getFatLossQuizIdCached, resolveReferrerFromShare } from "@/lib/quiz/quiz-service";
import { resolveActiveResultShare } from "@/lib/quiz/viral/quiz-result-share-lookup";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";

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

function addDaysIso(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
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
  const timings: Record<string, number> = {};
  const mark = (key: string, startedAt: number) => {
    timings[key] = Date.now() - startedAt;
  };

  const totalStarted = Date.now();
  const supabase = requireService();

  // Attribution lookups are independent; null inputs return immediately.
  let stage = Date.now();
  const [quizId, referrer, growthShareId, resultShare] = await Promise.all([
    getFatLossQuizIdCached(),
    resolveReferrerFromShare({ shareCode: input.shareCode }),
    resolveValidatedGrowthShareId(input.referralShareToken),
    resolveActiveResultShare(input.resultShareCode),
  ]);
  mark("attribution", stage);

  const now = new Date();
  const nowIso = now.toISOString();
  const emptyScores = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } as Record<PersonalityType, number>;

  // Required seed rows: one completed response + one placeholder result (FK).
  // No separate UPDATE after insert; no reload + rate-limit round trips.
  stage = Date.now();
  const { data: response, error: responseError } = await supabase
    .from("quiz_responses")
    .insert({
      quiz_id: quizId,
      respondent_name: "你",
      referrer_member_id: referrer.referrerMemberId,
      share_code: referrer.shareCode,
      growth_share_id: growthShareId,
      answers_json: { [NATIVE_V1_SEED_KEY]: true },
      completed_at: nowIso,
    })
    .select("id")
    .single();
  if (responseError || !response) {
    throw new AnalysisSessionError(responseError?.message || "Failed to seed quiz response.", 500, "seed_response_failed");
  }
  mark("insert_response", stage);

  stage = Date.now();
  const { data: result, error: resultError } = await supabase
    .from("quiz_results")
    .insert({
      response_id: response.id,
      primary_type: "A",
      secondary_type: "A",
      personality_scores_json: emptyScores,
      urgency: "low",
      readiness: "low",
      action_history_json: [],
      primary_goal: "unspecified",
      interaction_priority: "low",
    })
    .select("id")
    .single();
  if (resultError || !result) {
    throw new AnalysisSessionError(resultError?.message || "Failed to seed quiz result.", 500, "seed_result_failed");
  }
  mark("insert_result", stage);

  const attribution = resolveAnalysisAttribution({
    growthShareId,
    quizShareCode: referrer.shareCode,
    referrerMemberId: referrer.referrerMemberId,
    radarCandidateId: input.radarCandidateId ?? null,
    resultShareId: resultShare?.id ?? null,
  });
  const resetSession = createInitialResetSession();
  const plaintextToken = generateAnalysisSessionToken();
  const tokenHash = hashAnalysisSessionToken(plaintextToken);
  const expiresAt = addDaysIso(now, ANALYSIS_SESSION_TTL_DAYS);

  stage = Date.now();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("analysis_sessions")
    .insert({
      token_hash: tokenHash,
      quiz_result_id: result.id,
      source_type: attribution.sourceType,
      growth_share_id: attribution.growthShareId,
      quiz_share_code: attribution.quizShareCode,
      referrer_member_id: attribution.referrerMemberId,
      radar_candidate_id: attribution.radarCandidateId,
      radar_source_meta: attribution.radarSourceMeta,
      result_share_id: attribution.resultShareId,
      status: "active",
      analysis_state: "questions_in_progress",
      report_id: null,
      created_at: nowIso,
      expires_at: expiresAt,
      last_activity_at: nowIso,
      answers_json: packResetSession(resetSession),
      current_question_id: resetSession.quiz.currentQuestionId,
      intake_schema_version: RESET_SCHEMA_VERSION,
    })
    .select("expires_at")
    .single();
  if (sessionError || !sessionRow) {
    throw new AnalysisSessionError(sessionError?.message || "Failed to create analysis session.", 500, "create_failed");
  }
  mark("insert_session", stage);
  mark("total", totalStarted);

  return {
    token: plaintextToken,
    expiresAt: String(sessionRow.expires_at),
    entry: RESET_ENTRY,
    experience: toPublicView(resetSession),
    timings,
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
