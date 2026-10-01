/**
 * Lose2kg week-4 outcomes questionnaire — lose2kg-only module.
 * Independent public token; does not touch staff workstation bootstrap.
 */

import { Lose2kgError } from "@/lib/lose2kg/api";
import { buildPublicShareUrl } from "@/lib/app/public-origin";
import { decryptLose2kgToken, encryptLose2kgToken } from "@/lib/lose2kg/token-crypto";
import {
  generateLose2kgPublicToken,
  hashLose2kgPublicToken,
  normalizeLose2kgToken,
} from "@/lib/lose2kg/tokens";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type {
  Lose2kgBiggestChange,
  Lose2kgBusinessInterest,
  Lose2kgConsultationInterest,
  Lose2kgDesiredHelp,
  Lose2kgFavoritePart,
  Lose2kgIncomeInterest,
  Lose2kgProductInterest,
  Lose2kgQuestionnaireResponse,
  Lose2kgQuestionnaireResultRow,
  Lose2kgQuestionnaireSettings,
} from "@/types/lose2kg";
import {
  isBusinessInterested,
  isProductHigh,
  wantsConsultation,
} from "@/lib/lose2kg/questionnaire-rules";

export {
  isBusinessInterested,
  isProductHigh,
  matchesQuestionnaireSegment,
  wantsConsultation,
} from "@/lib/lose2kg/questionnaire-rules";

function db() {
  return createSupabaseServiceClient();
}

function nowIso() {
  return new Date().toISOString();
}

const BIGGEST_CHANGE = new Set<Lose2kgBiggestChange>([
  "weight",
  "body_composition",
  "diet",
  "exercise",
  "energy",
  "no_change",
  "other",
]);

const PRODUCT_INTEREST = new Set<Lose2kgProductInterest>([
  "know_what",
  "interested_need_guidance",
  "want_to_learn",
  "none",
]);

const DESIRED_HELP = new Set<Lose2kgDesiredHelp>([
  "diet",
  "product_pairing",
  "fat_loss",
  "muscle_body",
  "exercise_plan",
  "coach_support",
  "self_continue",
]);

const FAVORITE_PART = new Set<Lose2kgFavoritePart>([
  "challenge",
  "exercise_games",
  "nutrition_class",
  "product_experience",
  "team_atmosphere",
  "bring_friends",
  "other",
]);

const BUSINESS_INTEREST = new Set<Lose2kgBusinessInterest>([
  "very_interested",
  "open_to_listen",
  "customer_only",
  "not_now",
]);

const INCOME_INTEREST = new Set<Lose2kgIncomeInterest>([
  "willing_to_learn",
  "somewhat_interested",
  "not_interested",
]);

const CONSULTATION_INTEREST = new Set<Lose2kgConsultationInterest>([
  "yes",
  "contact_later",
  "no",
]);

export function buildSurveyUrl(token: string): string {
  return buildPublicShareUrl(`/lose2kg/survey/${token}`);
}

function mapSettings(
  row: Record<string, unknown>,
  publicToken?: string | null,
): Lose2kgQuestionnaireSettings {
  const token =
    publicToken ??
    decryptLose2kgToken(row.public_token_encrypted ? String(row.public_token_encrypted) : null);
  return {
    periodId: String(row.period_id),
    isOpen: Boolean(row.is_open),
    openedAt: row.opened_at ? String(row.opened_at) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
    publicToken: token,
    surveyUrl: token ? buildSurveyUrl(token) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapResponse(row: Record<string, unknown>): Lose2kgQuestionnaireResponse {
  const help = Array.isArray(row.desired_help)
    ? (row.desired_help as string[]).filter((h): h is Lose2kgDesiredHelp =>
        DESIRED_HELP.has(h as Lose2kgDesiredHelp),
      )
    : [];
  return {
    id: String(row.id),
    periodId: String(row.period_id),
    participantId: String(row.participant_id),
    inviterMemberId: String(row.inviter_member_id),
    coachMemberId: row.coach_member_id ? String(row.coach_member_id) : null,
    satisfactionScore: Number(row.satisfaction_score),
    biggestChange: row.biggest_change as Lose2kgBiggestChange,
    biggestChangeOther: row.biggest_change_other ? String(row.biggest_change_other) : null,
    nextGoal: String(row.next_goal ?? ""),
    productInterest: row.product_interest as Lose2kgProductInterest,
    desiredHelp: help,
    favoritePart: row.favorite_part as Lose2kgFavoritePart,
    favoritePartOther: row.favorite_part_other ? String(row.favorite_part_other) : null,
    businessInterest: row.business_interest as Lose2kgBusinessInterest,
    incomeInterest: row.income_interest as Lose2kgIncomeInterest,
    consultationInterest: row.consultation_interest as Lose2kgConsultationInterest,
    additionalNote: row.additional_note ? String(row.additional_note) : null,
    ticketAwarded: Boolean(row.ticket_awarded),
    submittedAt: String(row.submitted_at),
    updatedAt: String(row.updated_at),
  };
}

/** Deterministic segmentation — no AI. Re-exported from questionnaire-rules. */

async function ensurePeriodExists(periodId: string): Promise<void> {
  const { data, error } = await db()
    .from("lose2kg_periods")
    .select("id")
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到此期活動。", 404, "not_found");
}

export async function getOrCreateQuestionnaireSettings(
  periodId: string,
): Promise<Lose2kgQuestionnaireSettings> {
  await ensurePeriodExists(periodId);
  const { data: existing, error } = await db()
    .from("lose2kg_questionnaire_settings")
    .select("*")
    .eq("period_id", periodId)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (existing) return mapSettings(existing as Record<string, unknown>);

  const token = generateLose2kgPublicToken();
  const { data, error: insertErr } = await db()
    .from("lose2kg_questionnaire_settings")
    .insert({
      period_id: periodId,
      public_token_hash: hashLose2kgPublicToken(token),
      public_token_hint: token.slice(0, 6),
      public_token_encrypted: encryptLose2kgToken(token),
      is_open: false,
      updated_at: nowIso(),
    })
    .select("*")
    .single();
  if (insertErr) {
    // Concurrent create race → re-read
    const { data: again, error: againErr } = await db()
      .from("lose2kg_questionnaire_settings")
      .select("*")
      .eq("period_id", periodId)
      .maybeSingle();
    if (againErr) throw new Lose2kgError(againErr.message, 500, "db_error");
    if (again) return mapSettings(again as Record<string, unknown>);
    throw new Lose2kgError(insertErr.message, 500, "db_error");
  }
  return mapSettings(data as Record<string, unknown>, token);
}

export async function setQuestionnaireOpen(
  periodId: string,
  isOpen: boolean,
): Promise<Lose2kgQuestionnaireSettings> {
  const current = await getOrCreateQuestionnaireSettings(periodId);
  const updates: Record<string, unknown> = {
    is_open: isOpen,
    updated_at: nowIso(),
  };
  if (isOpen) {
    updates.opened_at = nowIso();
    updates.closed_at = null;
  } else {
    updates.closed_at = nowIso();
  }
  const { data, error } = await db()
    .from("lose2kg_questionnaire_settings")
    .update(updates)
    .eq("period_id", periodId)
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return mapSettings(data as Record<string, unknown>, current.publicToken);
}

export async function regenerateQuestionnaireToken(
  periodId: string,
): Promise<Lose2kgQuestionnaireSettings> {
  await getOrCreateQuestionnaireSettings(periodId);
  const token = generateLose2kgPublicToken();
  const { data, error } = await db()
    .from("lose2kg_questionnaire_settings")
    .update({
      public_token_hash: hashLose2kgPublicToken(token),
      public_token_hint: token.slice(0, 6),
      public_token_encrypted: encryptLose2kgToken(token),
      updated_at: nowIso(),
    })
    .eq("period_id", periodId)
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return mapSettings(data as Record<string, unknown>, token);
}

async function findSettingsBySurveyToken(
  tokenRaw: string,
): Promise<{ settings: Record<string, unknown>; token: string }> {
  const token = normalizeLose2kgToken(tokenRaw);
  if (!token) throw new Lose2kgError("無效問卷連結。", 404, "not_found");
  const { data, error } = await db()
    .from("lose2kg_questionnaire_settings")
    .select("*")
    .eq("public_token_hash", hashLose2kgPublicToken(token))
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到問卷。", 404, "not_found");
  return { settings: data as Record<string, unknown>, token };
}

export type PublicSurveyBootstrap = {
  periodId: string;
  periodName: string;
  isOpen: boolean;
  participants: { id: string; publicDisplayName: string }[];
};

export async function getPublicSurveyBootstrap(
  surveyToken: string,
): Promise<PublicSurveyBootstrap> {
  const { settings } = await findSettingsBySurveyToken(surveyToken);
  const periodId = String(settings.period_id);
  const { data: period, error: pErr } = await db()
    .from("lose2kg_periods")
    .select("id, name")
    .eq("id", periodId)
    .maybeSingle();
  if (pErr) throw new Lose2kgError(pErr.message, 500, "db_error");
  if (!period) throw new Lose2kgError("找不到此期活動。", 404, "not_found");

  const { data: participants, error } = await db()
    .from("lose2kg_participants")
    .select("id, public_display_name, status, sort_order, created_at")
    .eq("period_id", periodId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  return {
    periodId,
    periodName: String((period as Record<string, unknown>).name),
    isOpen: Boolean(settings.is_open),
    participants: (participants ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        publicDisplayName: String(r.public_display_name),
      };
    }),
  };
}

/** Public member search — id + display name only. */
export async function searchPublicSurveyMembers(input: {
  surveyToken: string;
  query: string;
  limit?: number;
}): Promise<{ id: string; name: string }[]> {
  await findSettingsBySurveyToken(input.surveyToken);
  const q = input.query.trim();
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 20);

  const { data, error } = await db()
    .from("members")
    .select("id, name")
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(limit);
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return { id: String(r.id), name: String(r.name) };
  });
}

export type QuestionnaireSubmitInput = {
  participantId: string;
  inviterMemberId: string;
  coachMemberId?: string | null;
  sameCoachAsInviter?: boolean;
  satisfactionScore: number;
  biggestChange: Lose2kgBiggestChange;
  biggestChangeOther?: string | null;
  nextGoal: string;
  productInterest: Lose2kgProductInterest;
  desiredHelp: Lose2kgDesiredHelp[];
  favoritePart: Lose2kgFavoritePart;
  favoritePartOther?: string | null;
  businessInterest: Lose2kgBusinessInterest;
  incomeInterest: Lose2kgIncomeInterest;
  consultationInterest: Lose2kgConsultationInterest;
  additionalNote?: string | null;
};

function validateSubmitInput(input: QuestionnaireSubmitInput): {
  coachMemberId: string | null;
  desiredHelp: Lose2kgDesiredHelp[];
  nextGoal: string;
} {
  if (!input.participantId) {
    throw new Lose2kgError("請選擇參賽名稱。", 400, "participant_required");
  }
  if (!input.inviterMemberId) {
    throw new Lose2kgError("請選擇邀請人。", 400, "inviter_required");
  }
  if (
    !Number.isInteger(input.satisfactionScore) ||
    input.satisfactionScore < 1 ||
    input.satisfactionScore > 10
  ) {
    throw new Lose2kgError("滿意度須為 1–10。", 400, "invalid_satisfaction");
  }
  if (!BIGGEST_CHANGE.has(input.biggestChange)) {
    throw new Lose2kgError("請選擇最大改變。", 400, "invalid_biggest_change");
  }
  if (!PRODUCT_INTEREST.has(input.productInterest)) {
    throw new Lose2kgError("請選擇產品興趣。", 400, "invalid_product_interest");
  }
  if (!FAVORITE_PART.has(input.favoritePart)) {
    throw new Lose2kgError("請選擇最喜歡的部分。", 400, "invalid_favorite_part");
  }
  if (!BUSINESS_INTEREST.has(input.businessInterest)) {
    throw new Lose2kgError("請選擇事業興趣。", 400, "invalid_business_interest");
  }
  if (!INCOME_INTEREST.has(input.incomeInterest)) {
    throw new Lose2kgError("請選擇收入了解意願。", 400, "invalid_income_interest");
  }
  if (!CONSULTATION_INTEREST.has(input.consultationInterest)) {
    throw new Lose2kgError("請選擇諮詢意願。", 400, "invalid_consultation");
  }
  const nextGoal = input.nextGoal.trim();
  if (!nextGoal) throw new Lose2kgError("請填寫最想改善的項目。", 400, "next_goal_required");
  if (nextGoal.length > 200) {
    throw new Lose2kgError("最想改善的項目過長。", 400, "next_goal_too_long");
  }
  const desiredHelp = (input.desiredHelp ?? []).filter((h) => DESIRED_HELP.has(h));
  if (desiredHelp.length === 0) {
    throw new Lose2kgError("請至少選擇一項希望得到的協助。", 400, "desired_help_required");
  }
  const coachMemberId = input.sameCoachAsInviter
    ? input.inviterMemberId
    : input.coachMemberId?.trim() || null;
  return { coachMemberId, desiredHelp, nextGoal };
}

export async function submitPublicSurvey(
  surveyToken: string,
  input: QuestionnaireSubmitInput,
): Promise<{
  awardedThisSubmit: boolean;
  ticketAwarded: boolean;
  responseId: string;
}> {
  const { settings } = await findSettingsBySurveyToken(surveyToken);
  if (!settings.is_open) {
    throw new Lose2kgError("本期成果問卷已結束", 403, "questionnaire_closed");
  }
  const periodId = String(settings.period_id);
  const validated = validateSubmitInput(input);

  const { data, error } = await db().rpc("submit_lose2kg_questionnaire_v1", {
    p_period_id: periodId,
    p_participant_id: input.participantId,
    p_inviter_member_id: input.inviterMemberId,
    p_coach_member_id: validated.coachMemberId,
    p_satisfaction_score: input.satisfactionScore,
    p_biggest_change: input.biggestChange,
    p_biggest_change_other: input.biggestChangeOther?.trim() || null,
    p_next_goal: validated.nextGoal,
    p_product_interest: input.productInterest,
    p_desired_help: validated.desiredHelp,
    p_favorite_part: input.favoritePart,
    p_favorite_part_other: input.favoritePartOther?.trim() || null,
    p_business_interest: input.businessInterest,
    p_income_interest: input.incomeInterest,
    p_consultation_interest: input.consultationInterest,
    p_additional_note: input.additionalNote?.trim() || null,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("questionnaire_closed")) {
      throw new Lose2kgError("本期成果問卷已結束", 403, "questionnaire_closed");
    }
    if (msg.includes("participant_not_in_period") || msg.includes("participant_not_active")) {
      throw new Lose2kgError("找不到此參賽者。", 400, "invalid_participant");
    }
    if (msg.includes("inviter_required") || msg.includes("inviter_not_found")) {
      throw new Lose2kgError("請選擇有效的邀請人。", 400, "inviter_required");
    }
    if (msg.includes("coach_not_found")) {
      throw new Lose2kgError("請選擇有效的教練。", 400, "invalid_coach");
    }
    if (msg.includes("questionnaire_not_configured")) {
      throw new Lose2kgError("問卷尚未設定。", 404, "not_found");
    }
    throw new Lose2kgError(error.message, 500, "db_error");
  }

  const result = data as Record<string, unknown>;
  return {
    awardedThisSubmit: Boolean(result.awarded_this_submit),
    ticketAwarded: Boolean(result.ticket_awarded),
    responseId: String(result.response_id),
  };
}

export type QuestionnaireAdminSummary = {
  settings: Lose2kgQuestionnaireSettings;
  activeParticipantCount: number;
  responseCount: number;
  pendingCount: number;
  consultationCount: number;
  productHighCount: number;
  businessInterestCount: number;
  rows: Lose2kgQuestionnaireResultRow[];
};

export async function getQuestionnaireAdminResults(
  periodId: string,
): Promise<QuestionnaireAdminSummary> {
  const settings = await getOrCreateQuestionnaireSettings(periodId);

  const [{ data: participants, error: pErr }, { data: responses, error: rErr }] =
    await Promise.all([
      db()
        .from("lose2kg_participants")
        .select("id, name, public_display_name, status, sort_order, created_at")
        .eq("period_id", periodId)
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      db()
        .from("lose2kg_questionnaire_responses")
        .select("*")
        .eq("period_id", periodId),
    ]);
  if (pErr) throw new Lose2kgError(pErr.message, 500, "db_error");
  if (rErr) throw new Lose2kgError(rErr.message, 500, "db_error");

  const responseList = (responses ?? []).map((row) =>
    mapResponse(row as Record<string, unknown>),
  );
  const byParticipant = new Map(responseList.map((r) => [r.participantId, r]));

  const memberIds = new Set<string>();
  for (const r of responseList) {
    memberIds.add(r.inviterMemberId);
    if (r.coachMemberId) memberIds.add(r.coachMemberId);
  }

  const memberNameById = new Map<string, string>();
  if (memberIds.size > 0) {
    const { data: members, error: mErr } = await db()
      .from("members")
      .select("id, name")
      .in("id", [...memberIds]);
    if (mErr) throw new Lose2kgError(mErr.message, 500, "db_error");
    for (const m of members ?? []) {
      const row = m as Record<string, unknown>;
      memberNameById.set(String(row.id), String(row.name));
    }
  }

  const rows: Lose2kgQuestionnaireResultRow[] = (participants ?? []).map((p) => {
    const pr = p as Record<string, unknown>;
    const participantId = String(pr.id);
    const response = byParticipant.get(participantId) ?? null;
    const productHigh = response ? isProductHigh(response) : false;
    const businessInterested = response ? isBusinessInterested(response) : false;
    const consultation = response ? wantsConsultation(response) : false;
    return {
      participantId,
      participantName: String(pr.name),
      publicDisplayName: String(pr.public_display_name),
      hasResponse: Boolean(response),
      inviterName: response
        ? (memberNameById.get(response.inviterMemberId) ?? null)
        : null,
      coachName: response?.coachMemberId
        ? (memberNameById.get(response.coachMemberId) ?? null)
        : null,
      productInterest: response?.productInterest ?? null,
      businessInterest: response?.businessInterest ?? null,
      incomeInterest: response?.incomeInterest ?? null,
      consultationInterest: response?.consultationInterest ?? null,
      productHigh,
      businessInterested,
      wantsConsultation: consultation,
      submittedAt: response?.submittedAt ?? null,
      response,
    };
  });

  return {
    settings,
    activeParticipantCount: rows.length,
    responseCount: rows.filter((r) => r.hasResponse).length,
    pendingCount: rows.filter((r) => !r.hasResponse).length,
    consultationCount: rows.filter((r) => r.wantsConsultation).length,
    productHighCount: rows.filter((r) => r.productHigh).length,
    businessInterestCount: rows.filter((r) => r.businessInterested).length,
    rows,
  };
}
