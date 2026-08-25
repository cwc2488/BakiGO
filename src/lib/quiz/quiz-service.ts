import { randomBytes } from "crypto";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type { FatLossQuizAnswers, FatLossQuizResult, PersonalityType } from "@/lib/quiz/fat-loss/types";
import { FAT_LOSS_QUIZ_SLUG } from "@/lib/quiz/fat-loss/types";
import { generateFollowupMessage } from "@/lib/quiz/fat-loss/followup-message";
import {
  formatActionHistoryLabels,
  formatPrimaryGoal,
  scoreFatLossQuiz,
  validateFatLossAnswers,
} from "@/lib/quiz/fat-loss/score-quiz";
import { getPersonalityProfile, INTERACTION_PRIORITY_LABELS, READINESS_LABELS, URGENCY_LABELS } from "@/lib/quiz/fat-loss/personality-content";
import { NATIVE_V1_SEED_KEY } from "@/lib/analysis/native-entry";

export type QuizResponseRecord = {
  id: string;
  quizId: string;
  respondentName: string;
  referrerMemberId: string | null;
  shareCode: string | null;
  answers: FatLossQuizAnswers;
  startedAt: string;
  completedAt: string | null;
};

export type QuizResultRecord = QuizResponseRecord & {
  resultId: string;
  result: FatLossQuizResult;
  followupMessage: string | null;
};

function requireServiceClient() {
  if (!isSupabaseServiceConfigured()) {
    throw new Error("Supabase service role is not configured.");
  }
  return createSupabaseServiceClient();
}

export function generateShareCode(length = 6): string {
  return randomBytes(length)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length)
    .toUpperCase();
}

export async function getQuizIdBySlug(slug: string): Promise<string | null> {
  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("quiz_definitions")
    .select("id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.id ?? null;
}

/** Warm-instance cache for the public fat-loss quiz definition id (stable). */
let cachedFatLossQuizId: string | null = null;

export async function getFatLossQuizIdCached(): Promise<string> {
  if (cachedFatLossQuizId) return cachedFatLossQuizId;
  const id = await getQuizIdBySlug(FAT_LOSS_QUIZ_SLUG);
  if (!id) throw new Error("Quiz not found.");
  cachedFatLossQuizId = id;
  return id;
}

export async function resolveReferrerFromShare(input: {
  shareCode?: string | null;
  referrerMemberId?: string | null;
}): Promise<{ referrerMemberId: string | null; shareCode: string | null }> {
  if (input.referrerMemberId) {
    return { referrerMemberId: input.referrerMemberId, shareCode: input.shareCode ?? null };
  }
  if (!input.shareCode) {
    return { referrerMemberId: null, shareCode: null };
  }

  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("quiz_share_links")
    .select("owner_member_id, share_code")
    .eq("share_code", input.shareCode.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return {
    referrerMemberId: data?.owner_member_id ?? null,
    shareCode: data?.share_code ?? input.shareCode.toUpperCase(),
  };
}

export async function createQuizResponse(input: {
  quizSlug?: string;
  respondentName: string;
  shareCode?: string | null;
  referrerMemberId?: string | null;
  /** Opaque /r growth share token — validated server-side; wins over member share for A→B. */
  referralShareToken?: string | null;
}): Promise<QuizResponseRecord> {
  const quizId = await getQuizIdBySlug(input.quizSlug ?? FAT_LOSS_QUIZ_SLUG);
  if (!quizId) {
    throw new Error("Quiz not found.");
  }

  const referrer = await resolveReferrerFromShare({
    shareCode: input.shareCode,
    referrerMemberId: input.referrerMemberId,
  });

  const { resolveValidatedGrowthShareId } = await import("@/lib/analysis/resolve-growth-share");
  const growthShareId = await resolveValidatedGrowthShareId(input.referralShareToken);

  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("quiz_responses")
    .insert({
      quiz_id: quizId,
      respondent_name: input.respondentName.trim(),
      referrer_member_id: referrer.referrerMemberId,
      share_code: referrer.shareCode,
      growth_share_id: growthShareId,
      answers_json: {},
    })
    .select("id, quiz_id, respondent_name, referrer_member_id, share_code, answers_json, started_at, completed_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create quiz response.");
  }

  return {
    id: data.id,
    quizId: data.quiz_id,
    respondentName: data.respondent_name,
    referrerMemberId: data.referrer_member_id,
    shareCode: data.share_code,
    answers: (data.answers_json ?? {}) as FatLossQuizAnswers,
    startedAt: data.started_at,
    completedAt: data.completed_at,
  };
}

/**
 * Placeholder quiz_result so analysis_sessions.quiz_result_id stays NOT NULL.
 * Not a personality classification. Preview native_v1 entry only.
 */
export async function createNativeSeedQuizResult(input: {
  respondentName?: string;
  shareCode?: string | null;
  referrerMemberId?: string | null;
  referralShareToken?: string | null;
}): Promise<{ resultId: string; responseId: string }> {
  const quizId = await getFatLossQuizIdCached();
  const [referrer, growthShareId] = await Promise.all([
    resolveReferrerFromShare({
      shareCode: input.shareCode,
      referrerMemberId: input.referrerMemberId,
    }),
    (async () => {
      const { resolveValidatedGrowthShareId } = await import("@/lib/analysis/resolve-growth-share");
      return resolveValidatedGrowthShareId(input.referralShareToken);
    })(),
  ]);

  const now = new Date().toISOString();
  const emptyScores = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } as Record<PersonalityType, number>;
  const supabase = requireServiceClient();
  // One insert: seed answers + completed_at (no follow-up UPDATE round trip).
  const { data: response, error: responseError } = await supabase
    .from("quiz_responses")
    .insert({
      quiz_id: quizId,
      respondent_name: (input.respondentName?.trim() || "你"),
      referrer_member_id: referrer.referrerMemberId,
      share_code: referrer.shareCode,
      growth_share_id: growthShareId,
      answers_json: { [NATIVE_V1_SEED_KEY]: true },
      completed_at: now,
    })
    .select("id")
    .single();
  if (responseError || !response) {
    throw new Error(responseError?.message ?? "Failed to create quiz response.");
  }
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
    throw new Error(resultError?.message ?? "Failed to save native seed result.");
  }
  return { resultId: result.id, responseId: response.id };
}

export async function updateQuizResponseAnswers(
  responseId: string,
  answers: FatLossQuizAnswers,
): Promise<void> {
  const supabase = requireServiceClient();
  const { error } = await supabase
    .from("quiz_responses")
    .update({ answers_json: answers })
    .eq("id", responseId)
    .is("completed_at", null);
  if (error) {
    throw new Error(error.message);
  }
}

export async function completeQuizResponse(responseId: string): Promise<QuizResultRecord> {
  const supabase = requireServiceClient();
  const { data: response, error: responseError } = await supabase
    .from("quiz_responses")
    .select("id, quiz_id, respondent_name, referrer_member_id, share_code, answers_json, started_at, completed_at")
    .eq("id", responseId)
    .maybeSingle();

  if (responseError || !response) {
    throw new Error(responseError?.message ?? "Quiz response not found.");
  }

  const answers = (response.answers_json ?? {}) as FatLossQuizAnswers;
  const validationError = validateFatLossAnswers(answers);
  if (validationError) {
    throw new Error(validationError);
  }

  const scored = scoreFatLossQuiz(answers);
  const followupMessage = generateFollowupMessage({
    result: scored,
    respondentName: response.respondent_name,
  });

  const { data: result, error: resultError } = await supabase
    .from("quiz_results")
    .insert({
      response_id: response.id,
      primary_type: scored.primaryType,
      secondary_type: scored.secondaryType,
      personality_scores_json: scored.personalityScores,
      urgency: scored.urgency,
      readiness: scored.readiness,
      action_history_json: scored.actionHistory,
      primary_goal: scored.primaryGoal,
      interaction_priority: scored.interactionPriority,
    })
    .select("id, created_at")
    .single();

  if (resultError || !result) {
    throw new Error(resultError?.message ?? "Failed to save quiz result.");
  }

  const { error: completeError } = await supabase
    .from("quiz_responses")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", response.id);

  if (completeError) {
    throw new Error(completeError.message);
  }

  await supabase.from("quiz_ai_followups").insert({
    result_id: result.id,
    generated_message: followupMessage,
    model: "rule_v1",
  });

  return {
    id: response.id,
    quizId: response.quiz_id,
    respondentName: response.respondent_name,
    referrerMemberId: response.referrer_member_id,
    shareCode: response.share_code,
    answers,
    startedAt: response.started_at,
    completedAt: new Date().toISOString(),
    resultId: result.id,
    result: scored,
    followupMessage,
  };
}

export async function getQuizResultById(resultId: string): Promise<QuizResultRecord | null> {
  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("quiz_results")
    .select(`
      id,
      primary_type,
      secondary_type,
      personality_scores_json,
      urgency,
      readiness,
      action_history_json,
      primary_goal,
      interaction_priority,
      quiz_responses (
        id,
        quiz_id,
        respondent_name,
        referrer_member_id,
        share_code,
        answers_json,
        started_at,
        completed_at
      )
    `)
    .eq("id", resultId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data || !data.quiz_responses) {
    return null;
  }

  const response = Array.isArray(data.quiz_responses)
    ? data.quiz_responses[0]
    : data.quiz_responses;

  const { data: followup } = await supabase
    .from("quiz_ai_followups")
    .select("generated_message")
    .eq("result_id", resultId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const result: FatLossQuizResult = {
    primaryType: data.primary_type,
    secondaryType: data.secondary_type,
    personalityScores: data.personality_scores_json,
    urgency: data.urgency,
    readiness: data.readiness,
    actionHistory: data.action_history_json ?? [],
    primaryGoal: data.primary_goal,
    interactionPriority: data.interaction_priority,
  };

  return {
    id: response.id,
    quizId: response.quiz_id,
    respondentName: response.respondent_name,
    referrerMemberId: response.referrer_member_id,
    shareCode: response.share_code,
    answers: (response.answers_json ?? {}) as FatLossQuizAnswers,
    startedAt: response.started_at,
    completedAt: response.completed_at,
    resultId: data.id,
    result,
    followupMessage: followup?.generated_message ?? null,
  };
}

export async function listQuizResultsForMember(memberId: string): Promise<QuizResultRecord[]> {
  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("quiz_responses")
    .select(`
      id,
      quiz_id,
      respondent_name,
      referrer_member_id,
      share_code,
      answers_json,
      started_at,
      completed_at,
      quiz_results (
        id,
        primary_type,
        secondary_type,
        personality_scores_json,
        urgency,
        readiness,
        action_history_json,
        primary_goal,
        interaction_priority
      )
    `)
    .eq("referrer_member_id", memberId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).flatMap((row) => {
    const resultRow = Array.isArray(row.quiz_results) ? row.quiz_results[0] : row.quiz_results;
    if (!resultRow) {
      return [];
    }
    return [{
      id: row.id,
      quizId: row.quiz_id,
      respondentName: row.respondent_name,
      referrerMemberId: row.referrer_member_id,
      shareCode: row.share_code,
      answers: (row.answers_json ?? {}) as FatLossQuizAnswers,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      resultId: resultRow.id,
      result: {
        primaryType: resultRow.primary_type,
        secondaryType: resultRow.secondary_type,
        personalityScores: resultRow.personality_scores_json,
        urgency: resultRow.urgency,
        readiness: resultRow.readiness,
        actionHistory: resultRow.action_history_json ?? [],
        primaryGoal: resultRow.primary_goal,
        interactionPriority: resultRow.interaction_priority,
      },
      followupMessage: null,
    }];
  });
}

export async function createShareLinkForMember(input: {
  memberId: string;
  quizSlug?: string;
}): Promise<{ shareCode: string; url: string }> {
  const quizId = await getQuizIdBySlug(input.quizSlug ?? FAT_LOSS_QUIZ_SLUG);
  if (!quizId) {
    throw new Error("Quiz not found.");
  }

  const supabase = requireServiceClient();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shareCode = generateShareCode();
    const { error } = await supabase.from("quiz_share_links").insert({
      quiz_id: quizId,
      owner_member_id: input.memberId,
      share_code: shareCode,
    });
    if (!error) {
      return { shareCode, url: `/q/${shareCode}` };
    }
    if (!error.message.includes("duplicate")) {
      throw new Error(error.message);
    }
  }
  throw new Error("Unable to generate share code.");
}

/** One stable primary /q/{code} per member. Reuses the oldest active fat-loss share code. */
export async function getOrCreatePermanentShareLink(memberId: string): Promise<{
  shareCode: string;
  url: string;
}> {
  const quizId = await getQuizIdBySlug(FAT_LOSS_QUIZ_SLUG);
  if (!quizId) {
    throw new Error("Quiz not found.");
  }
  const supabase = requireServiceClient();
  const { data: existing, error } = await supabase
    .from("quiz_share_links")
    .select("share_code")
    .eq("owner_member_id", memberId)
    .eq("quiz_id", quizId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (existing?.share_code) {
    return { shareCode: existing.share_code, url: `/q/${existing.share_code}` };
  }
  return createShareLinkForMember({ memberId });
}

export async function listShareLinksForMember(memberId: string): Promise<Array<{ shareCode: string; createdAt: string; isActive: boolean }>> {
  const supabase = requireServiceClient();
  const { data, error } = await supabase
    .from("quiz_share_links")
    .select("share_code, created_at, is_active")
    .eq("owner_member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    shareCode: row.share_code,
    createdAt: row.created_at,
    isActive: row.is_active,
  }));
}

export function serializePublicResult(record: QuizResultRecord) {
  const primary = getPersonalityProfile(record.result.primaryType);
  const secondary = getPersonalityProfile(record.result.secondaryType);
  return {
    resultId: record.resultId,
    respondentName: record.respondentName,
    primary,
    secondary,
    primaryGoalLabel: formatPrimaryGoal(record.result.primaryGoal),
    urgencyLabel: URGENCY_LABELS[record.result.urgency],
    readinessLabel: READINESS_LABELS[record.result.readiness],
    actionHistoryLabels: formatActionHistoryLabels(record.result.actionHistory),
    interactionPriorityLabel: INTERACTION_PRIORITY_LABELS[record.result.interactionPriority],
    hasReferrer: Boolean(record.referrerMemberId),
  };
}

export function serializePartnerResult(record: QuizResultRecord) {
  return {
    ...serializePublicResult(record),
    responseId: record.id,
    shareCode: record.shareCode,
    followupMessage: record.followupMessage,
    interactionPriority: record.result.interactionPriority,
    urgency: record.result.urgency,
    readiness: record.result.readiness,
    actionHistory: record.result.actionHistory,
    primaryGoal: record.result.primaryGoal,
    personalityScores: record.result.personalityScores,
  };
}
