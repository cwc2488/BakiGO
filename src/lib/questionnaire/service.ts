import { randomBytes } from "crypto";
import { buildPublicShareUrl, getPublicAppOrigin } from "@/lib/app/public-origin";
import { fivePlusFiveToday, getBusinessWeekRange } from "@/lib/five-plus-five/dates";
import {
  QUESTIONNAIRE_CONTACT_TYPES,
  QUESTIONNAIRE_EXERCISE_VALUES,
  QUESTIONNAIRE_IMPROVEMENT_AREAS,
  QUESTIONNAIRE_INTEREST_VALUES,
  QUESTIONNAIRE_LEAD_STATUSES,
  QUESTIONNAIRE_LIMITS,
  QUESTIONNAIRE_PUBLIC_COPY,
  QUESTIONNAIRE_STATUS_SORT_ORDER,
  allowedQuestionnaireStatusActions,
  type QuestionnaireLeadStatusPatch,
  type QuestionnairePublicSubmitInput,
} from "@/lib/questionnaire/contract";
import { buildQuestionnaireContactFingerprint } from "@/lib/questionnaire/fingerprint";
import { QUESTIONNAIRE_RULES, resolveQuestionnaireTargets } from "@/lib/questionnaire/rules";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import type {
  QuestionnaireContactType,
  QuestionnaireDashboard,
  QuestionnaireExerciseFrequency,
  QuestionnaireInterestLevel,
  QuestionnaireLeadDetail,
  QuestionnaireLeadStatus,
  QuestionnaireLeadSummary,
  QuestionnairePublicConfig,
  QuestionnairePublicSubmitResult,
  QuestionnaireResponseView,
  QuestionnaireShareLinkView,
  QuestionnaireSource,
} from "@/types/questionnaire";

export class QuestionnaireError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "QuestionnaireError";
    this.status = status;
    this.code = code;
  }
}

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new QuestionnaireError("Questionnaire service unavailable.", 503, "service_unavailable");
  }
  return createSupabaseServiceClient();
}

export function normalizeQuestionnaireShareCode(code: string | null | undefined): string | null {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(normalized)) return null;
  return normalized;
}

function generateShareCode(length = 8): string {
  return randomBytes(length)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length)
    .toUpperCase();
}

function clip(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

function assertEnum<T extends string>(value: string, allowed: readonly T[], code: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new QuestionnaireError("表單內容無效。", 400, code);
}

export function normalizeQuestionnaireSource(raw: string | null | undefined): QuestionnaireSource {
  return raw === "onsite" ? "onsite" : "online";
}

function mapShareView(shareCode: string): QuestionnaireShareLinkView {
  const path = `/survey/${shareCode}`;
  const href = buildPublicShareUrl(path, getPublicAppOrigin());
  return {
    shareCode,
    href,
    display: href.replace(/^https?:\/\//, ""),
    previewPath: path,
    onsiteHref: `${path}?source=onsite`,
  };
}

export async function getOrCreateQuestionnaireShareLink(
  ownerMemberId: string,
): Promise<QuestionnaireShareLinkView> {
  const supabase = requireService();
  const { data: existing, error: existingError } = await supabase
    .from("questionnaire_share_links")
    .select("share_code")
    .eq("owner_member_id", ownerMemberId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    throw new QuestionnaireError(existingError.message, 500, "share_lookup_failed");
  }

  let shareCode = existing?.share_code ? String(existing.share_code) : null;
  if (!shareCode) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateShareCode();
      const { data: inserted, error: insertError } = await supabase
        .from("questionnaire_share_links")
        .insert({
          owner_member_id: ownerMemberId,
          share_code: candidate,
          is_active: true,
        })
        .select("share_code")
        .single();
      if (!insertError && inserted?.share_code) {
        shareCode = String(inserted.share_code);
        break;
      }
      if (insertError && !/duplicate|unique/i.test(insertError.message)) {
        throw new QuestionnaireError(insertError.message, 500, "share_create_failed");
      }
    }
  }
  if (!shareCode) {
    throw new QuestionnaireError("Failed to allocate questionnaire share code.", 500, "share_create_failed");
  }
  return mapShareView(shareCode);
}

export type ResolvedQuestionnaireOwner = {
  ownerMemberId: string;
  shareCode: string;
  partnerDisplayName: string | null;
};

export async function resolveActiveQuestionnaireOwnerByCode(
  rawCode: string,
): Promise<ResolvedQuestionnaireOwner> {
  const shareCode = normalizeQuestionnaireShareCode(rawCode);
  if (!shareCode) {
    throw new QuestionnaireError("問卷連結無效。", 404, "invalid_code");
  }
  const supabase = requireService();
  const { data, error } = await supabase
    .from("questionnaire_share_links")
    .select("share_code, owner_member_id, is_active, members:owner_member_id ( name )")
    .eq("share_code", shareCode)
    .maybeSingle();
  if (error) {
    throw new QuestionnaireError(error.message, 500, "owner_lookup_failed");
  }
  if (!data?.owner_member_id || data.is_active !== true) {
    throw new QuestionnaireError("問卷連結無效或已停用。", 404, "invalid_code");
  }
  const memberRaw = data.members as { name?: string | null } | Array<{ name?: string | null }> | null;
  const member = Array.isArray(memberRaw) ? memberRaw[0] ?? null : memberRaw;
  return {
    ownerMemberId: String(data.owner_member_id),
    shareCode,
    partnerDisplayName: member?.name?.trim() || null,
  };
}

export function getPublicQuestionnaireConfig(input: {
  shareCode: string;
  source?: string | null;
  partnerDisplayName?: string | null;
}): QuestionnairePublicConfig {
  return {
    valid: true,
    title: QUESTIONNAIRE_PUBLIC_COPY.title,
    description: QUESTIONNAIRE_PUBLIC_COPY.description,
    shareCode: input.shareCode,
    source: normalizeQuestionnaireSource(input.source),
    partnerDisplayName: input.partnerDisplayName?.trim() || null,
  };
}

export function validateQuestionnairePublicSubmit(input: QuestionnairePublicSubmitInput): {
  improvementAreas: string[];
  improvementOther: string | null;
  bodySatisfactionScore: number;
  weeklyExerciseFrequency: QuestionnaireExerciseFrequency;
  usesSupplements: boolean;
  supplementDetails: string | null;
  priorityImprovement: string;
  furtherUnderstandingInterest: QuestionnaireInterestLevel;
  displayName: string;
  contactType: QuestionnaireContactType;
  contactValue: string;
  source: QuestionnaireSource;
} {
  // Honeypot — treat as soft success at API layer; validation throws spam code.
  if (clip(input.companyWebsite, 200)) {
    throw new QuestionnaireError("ok", 200, "honeypot");
  }

  if (!input.consentAccepted) {
    throw new QuestionnaireError("請先勾選資料使用同意。", 400, "consent_required");
  }

  const displayName = clip(input.displayName, QUESTIONNAIRE_LIMITS.displayNameMax);
  if (displayName.length < 1) {
    throw new QuestionnaireError("請填寫稱呼／暱稱。", 400, "name_required");
  }

  const improvementAreas = Array.isArray(input.improvementAreas)
    ? [...new Set(input.improvementAreas.map((item) => clip(item, 40)).filter(Boolean))]
    : [];
  if (improvementAreas.length < 1) {
    throw new QuestionnaireError("請至少選擇一項想改善的方面。", 400, "areas_required");
  }
  for (const area of improvementAreas) {
    assertEnum(area, QUESTIONNAIRE_IMPROVEMENT_AREAS, "areas_invalid");
  }

  let improvementOther: string | null = null;
  if (improvementAreas.includes("其他")) {
    improvementOther = clip(input.improvementOther, QUESTIONNAIRE_LIMITS.improvementOtherMax) || null;
    if (!improvementOther) {
      throw new QuestionnaireError("請填寫「其他」內容。", 400, "other_required");
    }
  }

  const score = input.bodySatisfactionScore;
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new QuestionnaireError("請選擇身體滿意度 1～5。", 400, "satisfaction_invalid");
  }

  const weeklyExerciseFrequency = assertEnum(
    clip(input.weeklyExerciseFrequency, 40),
    QUESTIONNAIRE_EXERCISE_VALUES,
    "exercise_invalid",
  );

  if (typeof input.usesSupplements !== "boolean") {
    throw new QuestionnaireError("請選擇是否使用健康食品或補給品。", 400, "supplements_required");
  }
  const usesSupplements = input.usesSupplements;
  let supplementDetails: string | null = null;
  if (usesSupplements) {
    supplementDetails = clip(input.supplementDetails, QUESTIONNAIRE_LIMITS.supplementDetailsMax) || null;
    if (!supplementDetails) {
      throw new QuestionnaireError("請填寫目前使用的健康食品或補給品。", 400, "supplement_details_required");
    }
  }

  const priorityImprovement = clip(
    input.priorityImprovement,
    QUESTIONNAIRE_LIMITS.priorityImprovementMax,
  );
  if (priorityImprovement.length < 1) {
    throw new QuestionnaireError("請填寫最希望先改善的一件事。", 400, "priority_required");
  }

  const furtherUnderstandingInterest = assertEnum(
    clip(input.furtherUnderstandingInterest, 40),
    QUESTIONNAIRE_INTEREST_VALUES,
    "interest_invalid",
  );

  const contactType = assertEnum(
    clip(input.contactType, 20),
    QUESTIONNAIRE_CONTACT_TYPES,
    "contact_type_invalid",
  );
  const contactValue = clip(input.contactValue, QUESTIONNAIRE_LIMITS.contactValueMax);
  if (contactValue.length < 1) {
    throw new QuestionnaireError("請填寫聯絡方式。", 400, "contact_required");
  }

  return {
    improvementAreas,
    improvementOther,
    bodySatisfactionScore: score,
    weeklyExerciseFrequency,
    usesSupplements,
    supplementDetails,
    priorityImprovement,
    furtherUnderstandingInterest,
    displayName,
    contactType,
    contactValue,
    source: normalizeQuestionnaireSource(input.source),
  };
}

export async function submitQuestionnaireResponse(
  input: QuestionnairePublicSubmitInput,
  now: Date = new Date(),
): Promise<QuestionnairePublicSubmitResult> {
  const owner = await resolveActiveQuestionnaireOwnerByCode(input.shareCode);
  let validated;
  try {
    validated = validateQuestionnairePublicSubmit(input);
  } catch (error) {
    if (error instanceof QuestionnaireError && error.code === "honeypot") {
      return { ok: true, isNewLead: false };
    }
    throw error;
  }

  const fingerprint = buildQuestionnaireContactFingerprint({
    ownerMemberId: owner.ownerMemberId,
    contactType: validated.contactType,
    contactValue: validated.contactValue,
  });

  const supabase = requireService();
  const reportDate = fivePlusFiveToday(now);
  const nowIso = now.toISOString();

  const { data, error } = await supabase.rpc("submit_questionnaire_response_v1", {
    p_owner_member_id: owner.ownerMemberId,
    p_share_code: owner.shareCode,
    p_source: validated.source,
    p_report_date: reportDate,
    p_improvement_areas: validated.improvementAreas,
    p_improvement_other: validated.improvementOther,
    p_body_satisfaction_score: validated.bodySatisfactionScore,
    p_weekly_exercise_frequency: validated.weeklyExerciseFrequency,
    p_uses_supplements: validated.usesSupplements,
    p_supplement_details: validated.supplementDetails,
    p_priority_improvement: validated.priorityImprovement,
    p_further_understanding_interest: validated.furtherUnderstandingInterest,
    p_display_name: validated.displayName,
    p_contact_type: validated.contactType,
    p_contact_value: validated.contactValue,
    p_contact_fingerprint: fingerprint,
    p_consent_accepted_at: nowIso,
    p_now: nowIso,
  });

  if (error) {
    throw new QuestionnaireError(error.message, 500, "submit_failed");
  }

  const payload = data as { ok?: boolean; isNewLead?: boolean } | null;
  return {
    ok: true,
    isNewLead: Boolean(payload?.isNewLead),
  };
}

function mapLeadSummary(row: Record<string, unknown>): QuestionnaireLeadSummary {
  const needTags = Array.isArray(row.need_tags) ? row.need_tags.map((t) => String(t)) : [];
  return {
    id: String(row.id),
    displayName: String(row.display_name ?? ""),
    primaryNeed: row.primary_need ? String(row.primary_need) : null,
    needTags,
    interestLevel: (row.interest_level as QuestionnaireInterestLevel | null) ?? null,
    usesSupplements:
      typeof row.uses_supplements === "boolean" ? row.uses_supplements : null,
    status: row.status as QuestionnaireLeadStatus,
    lastResponseAt: String(row.last_response_at ?? row.updated_at),
    lastSource: normalizeQuestionnaireSource(String(row.last_source ?? "online")),
  };
}

function mapResponse(row: Record<string, unknown>): QuestionnaireResponseView {
  return {
    id: String(row.id),
    source: normalizeQuestionnaireSource(String(row.source ?? "online")),
    improvementAreas: Array.isArray(row.improvement_areas)
      ? row.improvement_areas.map((t) => String(t))
      : [],
    improvementOther: row.improvement_other ? String(row.improvement_other) : null,
    bodySatisfactionScore: Number(row.body_satisfaction_score),
    weeklyExerciseFrequency: row.weekly_exercise_frequency as QuestionnaireExerciseFrequency,
    usesSupplements: Boolean(row.uses_supplements),
    supplementDetails: row.supplement_details ? String(row.supplement_details) : null,
    priorityImprovement: String(row.priority_improvement ?? ""),
    furtherUnderstandingInterest: row.further_understanding_interest as QuestionnaireInterestLevel,
    displayName: String(row.display_name ?? ""),
    contactType: row.contact_type as QuestionnaireContactType,
    contactValue: String(row.contact_value ?? ""),
    consentAcceptedAt: String(row.consent_accepted_at),
    submittedAt: String(row.submitted_at),
  };
}

function sortLeadsForList(a: QuestionnaireLeadSummary, b: QuestionnaireLeadSummary): number {
  const orderA = QUESTIONNAIRE_STATUS_SORT_ORDER[a.status] ?? 99;
  const orderB = QUESTIONNAIRE_STATUS_SORT_ORDER[b.status] ?? 99;
  if (orderA !== orderB) return orderA - orderB;
  return b.lastResponseAt.localeCompare(a.lastResponseAt);
}

function taipeiDayBounds(isoDate: string): { startIso: string; endIso: string } {
  // Asia/Taipei = UTC+8; day [00:00, next 00:00)
  const startIso = new Date(`${isoDate}T00:00:00+08:00`).toISOString();
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const endIso = new Date(`${nextDate}T00:00:00+08:00`).toISOString();
  return { startIso, endIso };
}

export async function getQuestionnaireDashboard(
  ownerMemberId: string,
  now: Date = new Date(),
): Promise<QuestionnaireDashboard> {
  const supabase = requireService();
  const share = await getOrCreateQuestionnaireShareLink(ownerMemberId);
  const today = fivePlusFiveToday(now);
  const week = getBusinessWeekRange(today);
  const todayBounds = taipeiDayBounds(today);
  const weekStartBounds = taipeiDayBounds(week.start);
  const targets = resolveQuestionnaireTargets();

  const [
    todayFishRes,
    weekFishRes,
    invitationRes,
    totalRes,
    recentRes,
    todayOnsiteRes,
    todayOnlineRes,
  ] = await Promise.all([
    supabase
      .from("questionnaire_leads")
      .select("id", { count: "exact", head: true })
      .eq("owner_member_id", ownerMemberId)
      .gte("fish_credited_at", todayBounds.startIso)
      .lt("fish_credited_at", todayBounds.endIso),
    supabase
      .from("questionnaire_leads")
      .select("id", { count: "exact", head: true })
      .eq("owner_member_id", ownerMemberId)
      .gte("fish_credited_at", weekStartBounds.startIso)
      .lt("fish_credited_at", todayBounds.endIso),
    supabase
      .from("questionnaire_leads")
      .select("id", { count: "exact", head: true })
      .eq("owner_member_id", ownerMemberId)
      .not("invitation_credited_at", "is", null),
    supabase
      .from("questionnaire_leads")
      .select("id", { count: "exact", head: true })
      .eq("owner_member_id", ownerMemberId),
    supabase
      .from("questionnaire_leads")
      .select(
        "id, display_name, primary_need, need_tags, interest_level, uses_supplements, status, last_response_at, last_source, updated_at",
      )
      .eq("owner_member_id", ownerMemberId)
      .order("last_response_at", { ascending: false })
      .limit(QUESTIONNAIRE_RULES.recentLeadsLimit),
    supabase
      .from("questionnaire_leads")
      .select("id", { count: "exact", head: true })
      .eq("owner_member_id", ownerMemberId)
      .eq("first_source", "onsite")
      .gte("fish_credited_at", todayBounds.startIso)
      .lt("fish_credited_at", todayBounds.endIso),
    supabase
      .from("questionnaire_leads")
      .select("id", { count: "exact", head: true })
      .eq("owner_member_id", ownerMemberId)
      .eq("first_source", "online")
      .gte("fish_credited_at", todayBounds.startIso)
      .lt("fish_credited_at", todayBounds.endIso),
  ]);

  for (const res of [
    todayFishRes,
    weekFishRes,
    invitationRes,
    totalRes,
    recentRes,
    todayOnsiteRes,
    todayOnlineRes,
  ]) {
    if (res.error) {
      throw new QuestionnaireError(res.error.message, 500, "dashboard_failed");
    }
  }

  const todayValid = todayFishRes.count ?? 0;
  const todayTarget = targets.dailyValidNewLeads;

  return {
    todayValidNewLeads: todayValid,
    todayTarget,
    todayProgressPercent:
      todayTarget > 0 ? Math.min(100, Math.round((todayValid / todayTarget) * 100)) : 0,
    todayOnsite: todayOnsiteRes.count ?? 0,
    todayOnline: todayOnlineRes.count ?? 0,
    todayFishCredited: todayValid,
    weekValidNewLeads: weekFishRes.count ?? 0,
    invitationStartedCount: invitationRes.count ?? 0,
    totalLeadCount: totalRes.count ?? 0,
    share,
    recentLeads: (recentRes.data ?? []).map((row) => mapLeadSummary(row as Record<string, unknown>)),
  };
}

export async function listQuestionnaireLeads(input: {
  ownerMemberId: string;
  status?: string | null;
  search?: string | null;
  page?: number;
}): Promise<{ leads: QuestionnaireLeadSummary[]; page: number; pageSize: number; hasMore: boolean }> {
  const supabase = requireService();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = QUESTIONNAIRE_RULES.leadsPageSize;
  const from = (page - 1) * pageSize;
  const to = from + pageSize; // fetch one extra to detect hasMore

  let query = supabase
    .from("questionnaire_leads")
    .select(
      "id, display_name, primary_need, need_tags, interest_level, uses_supplements, status, last_response_at, last_source, updated_at",
    )
    .eq("owner_member_id", input.ownerMemberId);

  if (input.status && (QUESTIONNAIRE_LEAD_STATUSES as readonly string[]).includes(input.status)) {
    query = query.eq("status", input.status);
  }

  const search = clip(input.search, 80);
  if (search) {
    query = query.ilike("display_name", `%${search}%`);
  }

  // Fetch a reasonable window then sort in app for status priority + last_response_at
  // When filtering by status, DB order by last_response_at is enough.
  const fetchLimit = input.status ? to + 1 : Math.min(500, page * pageSize + pageSize + 1);
  const { data, error } = await query
    .order("last_response_at", { ascending: false })
    .limit(fetchLimit);

  if (error) {
    throw new QuestionnaireError(error.message, 500, "list_failed");
  }

  let leads = (data ?? []).map((row) => mapLeadSummary(row as Record<string, unknown>));
  if (!input.status) {
    leads = [...leads].sort(sortLeadsForList);
  }
  const slice = leads.slice(from, to);
  const hasMore = leads.length > to;

  return {
    leads: slice.slice(0, pageSize),
    page,
    pageSize,
    hasMore,
  };
}

export async function getQuestionnaireLeadDetail(input: {
  ownerMemberId: string;
  leadId: string;
}): Promise<QuestionnaireLeadDetail> {
  const supabase = requireService();
  const { data, error } = await supabase
    .from("questionnaire_leads")
    .select("*")
    .eq("id", input.leadId)
    .eq("owner_member_id", input.ownerMemberId)
    .maybeSingle();

  if (error) {
    throw new QuestionnaireError(error.message, 500, "detail_failed");
  }
  if (!data) {
    throw new QuestionnaireError("找不到這筆問卷名單。", 404, "not_found");
  }

  const summary = mapLeadSummary(data as Record<string, unknown>);
  const { data: responses, error: respError } = await supabase
    .from("questionnaire_responses")
    .select("*")
    .eq("lead_id", input.leadId)
    .eq("owner_member_id", input.ownerMemberId)
    .order("submitted_at", { ascending: false })
    .limit(QUESTIONNAIRE_RULES.responseHistoryLimit);

  if (respError) {
    throw new QuestionnaireError(respError.message, 500, "responses_failed");
  }

  const recentResponses = (responses ?? []).map((row) => mapResponse(row as Record<string, unknown>));
  const latestResponse = recentResponses[0] ?? null;

  return {
    ...summary,
    contactType: data.contact_type as QuestionnaireContactType,
    contactValue: String(data.contact_value ?? ""),
    supplementDetails: data.supplement_details ? String(data.supplement_details) : null,
    firstSource: normalizeQuestionnaireSource(String(data.first_source ?? "online")),
    firstResponseAt: String(data.first_response_at),
    responseCount: Number(data.response_count ?? 1),
    fishCreditedAt: data.fish_credited_at ? String(data.fish_credited_at) : null,
    invitationStartedAt: data.invitation_started_at ? String(data.invitation_started_at) : null,
    invitationCreditedAt: data.invitation_credited_at ? String(data.invitation_credited_at) : null,
    latestResponse,
    recentResponses,
  };
}

export function allowedStatusActions(status: QuestionnaireLeadStatus): QuestionnaireLeadStatusPatch[] {
  return allowedQuestionnaireStatusActions(status);
}

export async function updateQuestionnaireLeadStatus(input: {
  ownerMemberId: string;
  leadId: string;
  status: string;
  now?: Date;
}): Promise<QuestionnaireLeadDetail> {
  if (!(QUESTIONNAIRE_LEAD_STATUSES as readonly string[]).includes(input.status)) {
    throw new QuestionnaireError("狀態無效。", 400, "status_invalid");
  }
  const nextStatus = input.status as QuestionnaireLeadStatus;
  const now = input.now ?? new Date();

  const current = await getQuestionnaireLeadDetail({
    ownerMemberId: input.ownerMemberId,
    leadId: input.leadId,
  });
  const allowed = allowedQuestionnaireStatusActions(current.status);
  if (!allowed.includes(nextStatus as QuestionnaireLeadStatusPatch) && nextStatus !== current.status) {
    throw new QuestionnaireError("此狀態不可轉換。", 400, "status_transition_invalid");
  }

  if (nextStatus === "invitation_started") {
    await startQuestionnaireLeadInvitation({
      ownerMemberId: input.ownerMemberId,
      leadId: input.leadId,
      now,
    });
    return getQuestionnaireLeadDetail({
      ownerMemberId: input.ownerMemberId,
      leadId: input.leadId,
    });
  }

  const supabase = requireService();
  const { error } = await supabase
    .from("questionnaire_leads")
    .update({ status: nextStatus, updated_at: now.toISOString() })
    .eq("id", input.leadId)
    .eq("owner_member_id", input.ownerMemberId);

  if (error) {
    throw new QuestionnaireError(error.message, 500, "update_failed");
  }

  return getQuestionnaireLeadDetail({
    ownerMemberId: input.ownerMemberId,
    leadId: input.leadId,
  });
}

export async function startQuestionnaireLeadInvitation(input: {
  ownerMemberId: string;
  leadId: string;
  now?: Date;
}): Promise<{ credited: boolean }> {
  const now = input.now ?? new Date();
  const supabase = requireService();
  const reportDate = fivePlusFiveToday(now);

  const { data, error } = await supabase.rpc("start_questionnaire_lead_invitation_v1", {
    p_owner_member_id: input.ownerMemberId,
    p_lead_id: input.leadId,
    p_report_date: reportDate,
    p_now: now.toISOString(),
  });

  if (error) {
    if (/lead_not_found/i.test(error.message)) {
      throw new QuestionnaireError("找不到這筆問卷名單。", 404, "not_found");
    }
    throw new QuestionnaireError(error.message, 500, "invitation_failed");
  }

  const payload = data as { credited?: boolean } | null;
  return { credited: Boolean(payload?.credited) };
}
