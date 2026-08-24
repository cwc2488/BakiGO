/**
 * QUIZ-AI-21 + QUIZ-VIRAL-01 attribution precedence:
 *
 * 1. Referral growth share (`/r/{token}` → growth_shares.id) WINS for A→B authority.
 * 2. Ordinary quiz member share (`/q/{code}` → referrer_member_id) must NOT overwrite (1).
 * 3. Consumer result share (`/s/{code}` → quiz_result_shares.id) is viral evidence only.
 *    It never impersonates a Partner /q code. It loses to (1) and (2).
 * 4. Direct (no share) when none of the above is present.
 * 5. Radar candidate is nullable future-only; never required for P1.
 *
 * Formal conversion linkage (Customer B) is deferred to later phases.
 * Result-share counts are not a business-potential score.
 */

export const ANALYSIS_SOURCE_TYPES = [
  "direct",
  "quiz_member_share",
  "referral_share",
  "radar_candidate",
  "result_share",
] as const;

export type AnalysisSourceType = (typeof ANALYSIS_SOURCE_TYPES)[number];

export const ANALYSIS_SESSION_STATUSES = ["active", "expired", "abandoned"] as const;
export type AnalysisSessionStatus = (typeof ANALYSIS_SESSION_STATUSES)[number];

/** P2 analysis state machine (orthogonal to session status active/expired). */
export const ANALYSIS_STATES = [
  "shell",
  "questions_in_progress",
  "questions_completed",
  "basic_report_ready",
  "ai_generating",
  "ai_ready",
  "ai_failed",
  /** @deprecated P1 only — treated as questions_in_progress on read */
  "in_progress",
  /** @deprecated P1 only — treated as ai_ready on read */
  "report_ready",
  /** @deprecated P1 only — treated as ai_failed on read */
  "report_failed",
] as const;
export type AnalysisState = (typeof ANALYSIS_STATES)[number];

export const ANALYSIS_ACTIVE_STATES = [
  "shell",
  "questions_in_progress",
  "questions_completed",
  "basic_report_ready",
  "ai_generating",
  "ai_ready",
  "ai_failed",
] as const;

export function normalizeAnalysisState(state: string): (typeof ANALYSIS_ACTIVE_STATES)[number] {
  if (state === "in_progress") return "questions_in_progress";
  if (state === "report_ready") return "ai_ready";
  if (state === "report_failed") return "ai_failed";
  if ((ANALYSIS_ACTIVE_STATES as readonly string[]).includes(state)) {
    return state as (typeof ANALYSIS_ACTIVE_STATES)[number];
  }
  return "shell";
}

export const ANALYSIS_SESSION_TTL_DAYS = 30 as const;

export const ANALYSIS_SESSION_RATE_LIMIT_PER_RESULT = 8 as const;

export type ResolvedAnalysisAttribution = {
  sourceType: AnalysisSourceType;
  growthShareId: string | null;
  quizShareCode: string | null;
  referrerMemberId: string | null;
  radarCandidateId: string | null;
  radarSourceMeta: Record<string, unknown>;
  resultShareId: string | null;
};

/**
 * Apply precedence: referral `/r` beats Partner `/q`, which beats consumer `/s`.
 * Callers must only pass growthShareId / resultShareId after server-side validation.
 * `resultShareId` is always retained for viral funnel even when it does not win source_type.
 */
export function resolveAnalysisAttribution(input: {
  growthShareId: string | null;
  quizShareCode: string | null;
  referrerMemberId: string | null;
  radarCandidateId?: string | null;
  radarSourceMeta?: Record<string, unknown>;
  resultShareId?: string | null;
}): ResolvedAnalysisAttribution {
  const radarCandidateId = input.radarCandidateId ?? null;
  const radarSourceMeta = input.radarSourceMeta ?? {};
  const resultShareId = input.resultShareId ?? null;

  if (input.growthShareId) {
    return {
      sourceType: "referral_share",
      growthShareId: input.growthShareId,
      // Keep quiz member fields for audit trail, but they do not own A→B authority.
      quizShareCode: input.quizShareCode,
      referrerMemberId: input.referrerMemberId,
      radarCandidateId,
      radarSourceMeta,
      resultShareId,
    };
  }

  if (input.referrerMemberId || input.quizShareCode) {
    return {
      sourceType: "quiz_member_share",
      growthShareId: null,
      quizShareCode: input.quizShareCode,
      referrerMemberId: input.referrerMemberId,
      radarCandidateId,
      radarSourceMeta,
      resultShareId,
    };
  }

  if (resultShareId) {
    return {
      sourceType: "result_share",
      growthShareId: null,
      quizShareCode: null,
      referrerMemberId: null,
      radarCandidateId,
      radarSourceMeta,
      resultShareId,
    };
  }

  if (radarCandidateId) {
    return {
      sourceType: "radar_candidate",
      growthShareId: null,
      quizShareCode: null,
      referrerMemberId: null,
      radarCandidateId,
      radarSourceMeta,
      resultShareId: null,
    };
  }

  return {
    sourceType: "direct",
    growthShareId: null,
    quizShareCode: null,
    referrerMemberId: null,
    radarCandidateId: null,
    radarSourceMeta,
    resultShareId: null,
  };
}
