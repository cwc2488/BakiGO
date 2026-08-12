import {
  EXPERIENCE_CHECKIN_POLICY,
  type CheckinTriggerReason,
  type CustomerExperienceCheckin,
  type FeltChangeConsent,
} from "@/types/coaching-growth";
import { CoachingServiceError, getCoachingEnrollmentForCoach } from "@/lib/coaching/coaching-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";

function mapCheckin(row: Record<string, unknown>): CustomerExperienceCheckin {
  const consentRaw = String(row.most_felt_change_consent ?? "coach_only");
  const consent: FeltChangeConsent = consentRaw === "share_ok" ? "share_ok" : "coach_only";
  const sourceRaw = String(row.source ?? "portal");
  const source =
    sourceRaw === "in_app_future" || sourceRaw === "coach_assisted_capture" ? sourceRaw : "portal";
  return {
    id: String(row.id),
    ownerMemberId: String(row.owner_member_id),
    customerId: String(row.customer_id),
    enrollmentId: row.enrollment_id != null ? String(row.enrollment_id) : null,
    triggerReason: String(row.trigger_reason) as CheckinTriggerReason,
    asOfLogDate: String(row.as_of_log_date ?? "").slice(0, 10),
    outcomePerception: row.outcome_perception != null ? Number(row.outcome_perception) : null,
    coachHelpfulness: row.coach_helpfulness != null ? Number(row.coach_helpfulness) : null,
    experienceSatisfaction:
      row.experience_satisfaction != null ? Number(row.experience_satisfaction) : null,
    recommendationWillingness:
      row.recommendation_willingness != null ? Number(row.recommendation_willingness) : null,
    mostFeltChangeText: row.most_felt_change_text != null ? String(row.most_felt_change_text) : null,
    mostFeltChangeConsent: consent,
    explicitReferralIntent: Boolean(row.explicit_referral_intent),
    struggleFlag: Boolean(row.struggle_flag),
    declineGrowthAsk: Boolean(row.decline_growth_ask),
    source,
    respondedAt: String(row.responded_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export type SubmitExperienceCheckinInput = {
  ownerMemberId: string;
  customerId: string;
  enrollmentId: string;
  triggerReason: CheckinTriggerReason;
  asOfLogDate: string;
  outcomePerception: number | null;
  coachHelpfulness: number | null;
  experienceSatisfaction: number | null;
  recommendationWillingness: number | null;
  mostFeltChangeText: string | null;
  mostFeltChangeConsent?: FeltChangeConsent;
  explicitReferralIntent?: boolean;
  struggleFlag?: boolean;
  declineGrowthAsk?: boolean;
  source?: CustomerExperienceCheckin["source"];
  /** Skip cooldown (coach-assisted capture only). */
  bypassCooldown?: boolean;
  asOfIso?: string;
};

export function assessCheckinTriggerEligibility(input: {
  latest: CustomerExperienceCheckin | null;
  asOfIso: string;
  attentionIsCoachAttention: boolean;
  triggerReason: CheckinTriggerReason;
}): { eligible: boolean; reason: string } {
  if (input.attentionIsCoachAttention) {
    return { eligible: false, reason: "coach_attention_active" };
  }
  if (!input.latest) {
    return { eligible: true, reason: "no_prior_checkin" };
  }
  const asOfMs = Date.parse(input.asOfIso);
  const respondedMs = Date.parse(input.latest.respondedAt);
  if (Number.isNaN(asOfMs) || Number.isNaN(respondedMs)) {
    return { eligible: false, reason: "invalid_timestamp" };
  }
  if (input.latest.struggleFlag) {
    return { eligible: false, reason: "struggle_active" };
  }
  if (input.latest.declineGrowthAsk) {
    if (asOfMs - respondedMs < EXPERIENCE_CHECKIN_POLICY.afterDeclineMs) {
      return { eligible: false, reason: "decline_cooldown" };
    }
  }
  const minGap =
    input.triggerReason === "coach_invite"
      ? EXPERIENCE_CHECKIN_POLICY.coachInviteSoftCapMs
      : EXPERIENCE_CHECKIN_POLICY.minGapMs;
  if (asOfMs - respondedMs < minGap) {
    return { eligible: false, reason: "min_gap_cooldown" };
  }
  if (
    input.triggerReason === "recheck" &&
    asOfMs - respondedMs < EXPERIENCE_CHECKIN_POLICY.afterCompletedRecheckMs
  ) {
    return { eligible: false, reason: "recheck_cooldown" };
  }
  return { eligible: true, reason: "ok" };
}

export async function getLatestExperienceCheckin(input: {
  enrollmentId: string;
  ownerMemberId: string;
}): Promise<CustomerExperienceCheckin | null> {
  await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("customer_experience_checkins")
    .select("*")
    .eq("enrollment_id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .order("responded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new CoachingServiceError(error.message || "Failed to load experience check-in.", 500);
  }
  return data ? mapCheckin(data as Record<string, unknown>) : null;
}

export async function listExperienceCheckinsForEnrollment(input: {
  enrollmentId: string;
  ownerMemberId: string;
  limit?: number;
}): Promise<CustomerExperienceCheckin[]> {
  await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("customer_experience_checkins")
    .select("*")
    .eq("enrollment_id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .order("responded_at", { ascending: false })
    .limit(input.limit ?? 20);
  if (error) {
    throw new CoachingServiceError(error.message || "Failed to list experience check-ins.", 500);
  }
  return (data ?? []).map((row) => mapCheckin(row as Record<string, unknown>));
}

export async function submitExperienceCheckin(
  input: SubmitExperienceCheckinInput,
): Promise<CustomerExperienceCheckin> {
  const enrollment = await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });
  if (enrollment.customerId !== input.customerId) {
    throw new CoachingServiceError("Customer mismatch.", 400);
  }

  const asOfIso = input.asOfIso ?? new Date().toISOString();
  const latest = await getLatestExperienceCheckin({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });

  if (!input.bypassCooldown) {
    const gate = assessCheckinTriggerEligibility({
      latest,
      asOfIso,
      attentionIsCoachAttention: false,
      triggerReason: input.triggerReason,
    });
    if (!gate.eligible) {
      throw new CoachingServiceError(`Check-in not eligible: ${gate.reason}`, 409);
    }
  }

  const clamp15 = (v: number | null) => {
    if (v == null || Number.isNaN(v)) return null;
    return Math.min(5, Math.max(1, Math.round(v)));
  };
  const clamp010 = (v: number | null) => {
    if (v == null || Number.isNaN(v)) return null;
    return Math.min(10, Math.max(0, Math.round(v)));
  };

  const nowIso = new Date().toISOString();
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("customer_experience_checkins")
    .insert({
      owner_member_id: input.ownerMemberId,
      customer_id: input.customerId,
      enrollment_id: input.enrollmentId,
      trigger_reason: input.triggerReason,
      as_of_log_date: input.asOfLogDate,
      outcome_perception: clamp15(input.outcomePerception),
      coach_helpfulness: clamp15(input.coachHelpfulness),
      experience_satisfaction: clamp15(input.experienceSatisfaction),
      recommendation_willingness: clamp010(input.recommendationWillingness),
      most_felt_change_text: input.mostFeltChangeText?.trim() || null,
      most_felt_change_consent: input.mostFeltChangeConsent ?? "coach_only",
      explicit_referral_intent: Boolean(input.explicitReferralIntent),
      struggle_flag: Boolean(input.struggleFlag),
      decline_growth_ask: Boolean(input.declineGrowthAsk),
      source: input.source ?? "portal",
      responded_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new CoachingServiceError(error?.message || "Failed to submit experience check-in.", 500);
  }
  return mapCheckin(data as Record<string, unknown>);
}

/** Portal-safe: resolve via enrollment already verified by token. */
export async function submitExperienceCheckinForPortal(input: {
  ownerMemberId: string;
  customerId: string;
  enrollmentId: string;
  payload: Omit<SubmitExperienceCheckinInput, "ownerMemberId" | "customerId" | "enrollmentId">;
}): Promise<CustomerExperienceCheckin> {
  return submitExperienceCheckin({
    ...input.payload,
    ownerMemberId: input.ownerMemberId,
    customerId: input.customerId,
    enrollmentId: input.enrollmentId,
    source: "portal",
  });
}

export async function getLatestExperienceCheckinForPortal(input: {
  enrollmentId: string;
  ownerMemberId: string;
  customerId: string;
}): Promise<CustomerExperienceCheckin | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("customer_experience_checkins")
    .select("*")
    .eq("enrollment_id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .eq("customer_id", input.customerId)
    .order("responded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new CoachingServiceError(error.message || "Failed to load check-in.", 500);
  }
  return data ? mapCheckin(data as Record<string, unknown>) : null;
}
