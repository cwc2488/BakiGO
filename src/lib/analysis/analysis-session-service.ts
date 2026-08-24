import {
  ANALYSIS_SESSION_RATE_LIMIT_PER_RESULT,
  ANALYSIS_SESSION_TTL_DAYS,
  normalizeAnalysisState,
  resolveAnalysisAttribution,
  type AnalysisSessionStatus,
  type AnalysisState,
  type AnalysisSourceType,
} from "@/lib/analysis/analysis-attribution";
import {
  generateAnalysisSessionToken,
  hashAnalysisSessionToken,
  isPlausibleAnalysisSessionToken,
} from "@/lib/analysis/analysis-session-token";
import { resolveValidatedGrowthShareId } from "@/lib/analysis/resolve-growth-share";
import { getPersonalityProfile } from "@/lib/quiz/fat-loss/personality-content";
import { createNativeSeedQuizResult } from "@/lib/quiz/quiz-service";
import { isNativeSeedAnswers } from "@/lib/analysis/native-entry";
import { resolveActiveResultShare } from "@/lib/quiz/viral/quiz-result-share-lookup";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export class AnalysisSessionError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AnalysisSessionError";
    this.status = status;
    this.code = code;
  }
}

export type AnalysisSessionRecord = {
  id: string;
  quizResultId: string;
  sourceType: AnalysisSourceType;
  growthShareId: string | null;
  quizShareCode: string | null;
  referrerMemberId: string | null;
  radarCandidateId: string | null;
  radarSourceMeta: Record<string, unknown>;
  resultShareId: string | null;
  status: AnalysisSessionStatus;
  analysisState: AnalysisState;
  reportId: string | null;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  answersJson: Record<string, unknown>;
  currentQuestionId: string | null;
  layer1Json: Record<string, unknown> | null;
  questionsCompletedAt: string | null;
  layer1ReadyAt: string | null;
};

export type AnalysisSessionPublicView = {
  tokenPresent: true;
  status: AnalysisSessionStatus;
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
  };
  sourceType: AnalysisSourceType;
  /** Opaque: only whether referral attribution is bound — never share ids to client. */
  hasReferralAttribution: boolean;
  hasQuizMemberReferrer: boolean;
};

type QuizResultJoinRow = {
  id: string;
  primary_type: string;
  quiz_responses: {
    id: string;
    respondent_name: string;
    referrer_member_id: string | null;
    share_code: string | null;
    growth_share_id: string | null;
    completed_at: string | null;
    answers_json?: unknown;
  } | null;
};

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new AnalysisSessionError("Analysis service unavailable.", 503, "service_unavailable");
  }
  return createSupabaseServiceClient();
}

function addDaysIso(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function mapSessionRow(row: {
  id: string;
  quiz_result_id: string;
  source_type: string;
  growth_share_id: string | null;
  quiz_share_code: string | null;
  referrer_member_id: string | null;
  radar_candidate_id: string | null;
  radar_source_meta: Record<string, unknown> | null;
  result_share_id?: string | null;
  status: string;
  analysis_state: string;
  report_id: string | null;
  created_at: string;
  expires_at: string;
  last_activity_at: string;
  answers_json?: Record<string, unknown> | null;
  current_question_id?: string | null;
  layer1_json?: Record<string, unknown> | null;
  questions_completed_at?: string | null;
  layer1_ready_at?: string | null;
}): AnalysisSessionRecord {
  return {
    id: row.id,
    quizResultId: row.quiz_result_id,
    sourceType: row.source_type as AnalysisSourceType,
    growthShareId: row.growth_share_id,
    quizShareCode: row.quiz_share_code,
    referrerMemberId: row.referrer_member_id,
    radarCandidateId: row.radar_candidate_id,
    radarSourceMeta: row.radar_source_meta ?? {},
    resultShareId: row.result_share_id ?? null,
    status: row.status as AnalysisSessionStatus,
    analysisState: normalizeAnalysisState(row.analysis_state),
    reportId: row.report_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastActivityAt: row.last_activity_at,
    answersJson: row.answers_json ?? {},
    currentQuestionId: row.current_question_id ?? null,
    layer1Json: row.layer1_json ?? null,
    questionsCompletedAt: row.questions_completed_at ?? null,
    layer1ReadyAt: row.layer1_ready_at ?? null,
  };
}

function effectiveStatus(session: AnalysisSessionRecord, nowMs: number): AnalysisSessionStatus {
  if (session.status === "abandoned") return "abandoned";
  if (new Date(session.expiresAt).getTime() <= nowMs) return "expired";
  return session.status === "expired" ? "expired" : "active";
}

/** Validate growth share token server-side; returns share id only if accepting referrals. */
export { resolveValidatedGrowthShareId } from "@/lib/analysis/resolve-growth-share";

async function loadCompletedQuizResult(quizResultId: string): Promise<QuizResultJoinRow> {
  const supabase = requireService();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(quizResultId)) {
    throw new AnalysisSessionError("Invalid quiz result.", 400, "invalid_quiz_result");
  }

  const { data, error } = await supabase
    .from("quiz_results")
    .select(
      `
      id,
      primary_type,
      quiz_responses (
        id,
        respondent_name,
        referrer_member_id,
        share_code,
        growth_share_id,
        completed_at,
        answers_json
      )
    `,
    )
    .eq("id", quizResultId)
    .maybeSingle();

  if (error) {
    throw new AnalysisSessionError(error.message || "Quiz result lookup failed.", 500, "quiz_lookup_failed");
  }
  if (!data?.id || !data.quiz_responses) {
    throw new AnalysisSessionError("Quiz result not found.", 404, "quiz_result_not_found");
  }
  // Supabase typings may surface nested relations as array; normalize to one row.
  const rawResponse = data.quiz_responses as unknown;
  const response = (
    Array.isArray(rawResponse) ? (rawResponse[0] ?? null) : rawResponse
  ) as QuizResultJoinRow["quiz_responses"];
  if (!response) {
    throw new AnalysisSessionError("Quiz result not found.", 404, "quiz_result_not_found");
  }
  if (!response.completed_at) {
    throw new AnalysisSessionError("Quiz result is incomplete.", 400, "quiz_result_incomplete");
  }
  return {
    id: String(data.id),
    primary_type: String(data.primary_type),
    quiz_responses: response,
  };
}

async function assertCreateRateLimit(quizResultId: string): Promise<void> {
  const supabase = requireService();
  const since = addDaysIso(new Date(), -1);
  const { count, error } = await supabase
    .from("analysis_sessions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_result_id", quizResultId)
    .gte("created_at", since);
  if (error) {
    throw new AnalysisSessionError(error.message || "Rate limit check failed.", 500, "rate_limit_check_failed");
  }
  if ((count ?? 0) >= ANALYSIS_SESSION_RATE_LIMIT_PER_RESULT) {
    throw new AnalysisSessionError("Too many analysis sessions for this result. Please try later.", 429, "rate_limited");
  }
}

/**
 * Create anonymous analysis session from a completed quiz result.
 * Optional referralShareToken is validated server-side and wins over quiz member referrer.
 * Client cannot claim ownership of a share id — only opaque tokens are accepted.
 */
export async function createAnalysisSession(input: {
  quizResultId: string;
  /** Opaque /r token — validated; never trust client-supplied share UUID. */
  referralShareToken?: string | null;
  /** Future only — accepted as opaque uuid string without product unlock. */
  radarCandidateId?: string | null;
  /** Opaque /s result-share code — resolved server-side. Never a Partner /q code. */
  resultShareCode?: string | null;
}): Promise<{ plaintextToken: string; session: AnalysisSessionRecord }> {
  const quiz = await loadCompletedQuizResult(input.quizResultId);
  await assertCreateRateLimit(input.quizResultId);

  const response = quiz.quiz_responses!;
  const fromQuizGrowthShareId = response.growth_share_id ? String(response.growth_share_id) : null;
  const fromTokenGrowthShareId = await resolveValidatedGrowthShareId(input.referralShareToken);

  // Precedence: existing quiz-bound referral OR newly validated token — never let member overwrite referral.
  // If both quiz-bound share and token resolve to different ids, reject forgery.
  let growthShareId: string | null = fromQuizGrowthShareId;
  if (fromTokenGrowthShareId) {
    if (fromQuizGrowthShareId && fromQuizGrowthShareId !== fromTokenGrowthShareId) {
      throw new AnalysisSessionError("Referral attribution conflict.", 409, "referral_conflict");
    }
    growthShareId = fromTokenGrowthShareId;
  }

  const resultShare = await resolveActiveResultShare(input.resultShareCode);

  const attribution = resolveAnalysisAttribution({
    growthShareId,
    quizShareCode: response.share_code,
    referrerMemberId: response.referrer_member_id,
    radarCandidateId: input.radarCandidateId ?? null,
    resultShareId: resultShare?.id ?? null,
  });

  const now = new Date();
  const plaintextToken = generateAnalysisSessionToken();
  const tokenHash = hashAnalysisSessionToken(plaintextToken);
  const expiresAt = addDaysIso(now, ANALYSIS_SESSION_TTL_DAYS);

  const supabase = requireService();
  const { data, error } = await supabase
    .from("analysis_sessions")
    .insert({
      token_hash: tokenHash,
      quiz_result_id: input.quizResultId,
      source_type: attribution.sourceType,
      growth_share_id: attribution.growthShareId,
      quiz_share_code: attribution.quizShareCode,
      referrer_member_id: attribution.referrerMemberId,
      radar_candidate_id: attribution.radarCandidateId,
      radar_source_meta: attribution.radarSourceMeta,
      result_share_id: attribution.resultShareId,
      status: "active",
      analysis_state: "shell",
      report_id: null,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      last_activity_at: now.toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new AnalysisSessionError(error?.message || "Failed to create analysis session.", 500, "create_failed");
  }

  return { plaintextToken, session: mapSessionRow(data) };
}

/** Seed quiz_result + analysis session for native_v1 Preview and RESET Quiz V2 (including Production). */
export async function createNativeAnalysisSession(input: {
  referralShareToken?: string | null;
  radarCandidateId?: string | null;
  /** Opaque /q share code — resolved server-side to owner. Never a member UUID. */
  shareCode?: string | null;
  /** Opaque /s result-share code. Never sent as shareCode. */
  resultShareCode?: string | null;
}): Promise<{ plaintextToken: string; session: AnalysisSessionRecord }> {
  const seed = await createNativeSeedQuizResult({
    respondentName: "你",
    referralShareToken: input.referralShareToken,
    shareCode: input.shareCode,
  });
  return createAnalysisSession({
    quizResultId: seed.resultId,
    referralShareToken: input.referralShareToken,
    radarCandidateId: input.radarCandidateId,
    resultShareCode: input.resultShareCode,
  });
}

export async function getAnalysisSessionByToken(
  token: string,
  options?: { touchActivity?: boolean; nowMs?: number },
): Promise<AnalysisSessionPublicView> {
  if (!isPlausibleAnalysisSessionToken(token)) {
    throw new AnalysisSessionError("Invalid analysis link.", 404, "invalid_token");
  }

  const supabase = requireService();
  const tokenHash = hashAnalysisSessionToken(token);
  const { data, error } = await supabase
    .from("analysis_sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new AnalysisSessionError(error.message || "Session lookup failed.", 500, "lookup_failed");
  }
  if (!data) {
    throw new AnalysisSessionError("Analysis session not found.", 404, "not_found");
  }

  const session = mapSessionRow(data);
  const nowMs = options?.nowMs ?? Date.now();
  const status = effectiveStatus(session, nowMs);
  if (status === "expired") {
    throw new AnalysisSessionError("This analysis link has expired.", 410, "expired");
  }

  const quiz = await loadCompletedQuizResult(session.quizResultId);
  const nativeSeed = isNativeSeedAnswers(
    (quiz.quiz_responses as { answers_json?: unknown } | null)?.answers_json,
  );
  const primary = nativeSeed
    ? {
        animalName: "",
        tagline: "",
        headline: "",
        coreInsight: "",
      }
    : getPersonalityProfile(quiz.primary_type as "A" | "B" | "C" | "D" | "E" | "F");

  if (options?.touchActivity !== false) {
    await supabase
      .from("analysis_sessions")
      .update({ last_activity_at: new Date(nowMs).toISOString() })
      .eq("id", session.id);
  }

  return {
    tokenPresent: true,
    status,
    analysisState: session.analysisState,
    expiresAt: session.expiresAt,
    quizSummary: {
      resultId: session.quizResultId,
      respondentName: quiz.quiz_responses!.respondent_name,
      primaryType: quiz.primary_type,
      animalName: primary.animalName,
      tagline: primary.tagline,
      headline: primary.headline,
      coreInsight: primary.coreInsight,
    },
    sourceType: session.sourceType,
    hasReferralAttribution: Boolean(session.growthShareId),
    hasQuizMemberReferrer: Boolean(session.referrerMemberId || session.quizShareCode),
  };
}

/** Test helper: assert session row has no PII-shaped columns populated beyond allowed fields. */
export function assertAnalysisSessionHasNoPii(session: AnalysisSessionRecord): void {
  const forbiddenKeys = ["phone", "line_id", "email", "respondent_contact", "display_name", "full_name"];
  const serialized = JSON.stringify(session).toLowerCase();
  for (const key of forbiddenKeys) {
    if (serialized.includes(`"${key}"`)) {
      throw new Error(`Unexpected PII-shaped field: ${key}`);
    }
  }
}

/** Internal: load raw session by opaque token (expiry enforced). */
export async function requireAnalysisSessionRowByToken(token: string): Promise<{
  id: string;
  quiz_result_id: string;
  analysis_state: string;
  answers_json: Record<string, unknown> | null;
  current_question_id: string | null;
  layer1_json: Record<string, unknown> | null;
  report_id: string | null;
  expires_at: string;
  status: string;
  questions_completed_at: string | null;
  layer1_ready_at: string | null;
}> {
  if (!isPlausibleAnalysisSessionToken(token)) {
    throw new AnalysisSessionError("Invalid analysis link.", 404, "invalid_token");
  }
  const supabase = requireService();
  const tokenHash = hashAnalysisSessionToken(token);
  const { data, error } = await supabase
    .from("analysis_sessions")
    .select(
      "id, quiz_result_id, analysis_state, answers_json, current_question_id, layer1_json, report_id, expires_at, status, questions_completed_at, layer1_ready_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    throw new AnalysisSessionError(error.message || "Session lookup failed.", 500, "lookup_failed");
  }
  if (!data) {
    throw new AnalysisSessionError("Analysis session not found.", 404, "not_found");
  }
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new AnalysisSessionError("This analysis link has expired.", 410, "expired");
  }
  return data;
}

export async function touchAnalysisSession(sessionId: string): Promise<void> {
  const supabase = requireService();
  await supabase
    .from("analysis_sessions")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", sessionId);
}
