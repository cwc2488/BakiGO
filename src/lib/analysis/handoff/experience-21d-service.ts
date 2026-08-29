import type { AnalysisSourceType } from "@/lib/analysis/analysis-attribution";
import { AnalysisSessionError } from "@/lib/analysis/analysis-session-service";
import { hashAnalysisSessionToken, isPlausibleAnalysisSessionToken } from "@/lib/analysis/analysis-session-token";
import { resolve21dOwnership } from "@/lib/analysis/handoff/experience-21d-attribution";
import { compileCoachHandoffBrief, type CoachHandoffBrief } from "@/lib/analysis/handoff/experience-21d-brief";
import {
  hasUsableContact,
  parse21dContact,
  type Experience21dContactInput,
} from "@/lib/analysis/handoff/experience-21d-contact";
import { build21dInvitation, type Experience21dPublicHandoff } from "@/lib/analysis/handoff/experience-21d-invitation";
import {
  EXPERIENCE_21D_SOURCE,
  type Experience21dFunnelEvent,
  type Experience21dStatus,
} from "@/lib/analysis/handoff/experience-21d-path";
import {
  EXPERIENCE_21D_LANDING_VERSION,
  isExperience21dConsultationPreference,
  type Experience21dConsultationPreference,
} from "@/lib/experience/experience-21d-landing-copy";
import { RESET_META_KEY } from "@/lib/analysis/reset/reset-path";
import type { ResetPublicView, ResetSession } from "@/lib/analysis/reset/reset-contract";
import { normalizeCustomerPhone } from "@/lib/customers/customer-profile";
import {
  animalPresentation,
  monthNewStartIso,
  sortQuizPartnerLeads,
} from "@/lib/quiz/partner/quiz-partner-presentation";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export type { Experience21dPublicHandoff } from "@/lib/analysis/handoff/experience-21d-invitation";

type InterestRow = {
  id: string;
  analysis_session_id: string;
  customer_id: string | null;
  owner_member_id: string | null;
  source: string;
  status: Experience21dStatus;
  attribution_source_type: AnalysisSourceType;
  growth_share_id: string | null;
  quiz_share_code: string | null;
  referrer_member_id: string | null;
  primary_animal_type: string | null;
  secondary_animal_type: string | null;
  display_name: string | null;
  contact_channel: string | null;
  contact_value: string | null;
  consultation_preference: Experience21dConsultationPreference | null;
  landing_page_version: string | null;
  invitation_bridge: string | null;
  brief_json: CoachHandoffBrief;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new AnalysisSessionError("Analysis service unavailable.", 503, "service_unavailable");
  }
  return createSupabaseServiceClient();
}

export function toPublicHandoff(
  session: ResetSession,
  interest: Pick<InterestRow, "contact_channel" | "contact_value"> | null,
): Experience21dPublicHandoff | null {
  if (session.act !== "report" || !session.report) return null;
  const created = hasUsableContact(interest);
  return {
    invitation: build21dInvitation(session.report),
    interest: created
      ? { state: "created", needsContact: false }
      : { state: "none", needsContact: true },
  };
}

export function attachPublicHandoff(
  view: ResetPublicView,
  handoff: Experience21dPublicHandoff | null,
): ResetPublicView {
  return handoff ? { ...view, handoff } : view;
}

export async function record21dFunnelEvent(input: {
  analysisSessionId: string;
  event: Experience21dFunnelEvent;
  interestId?: string | null;
}): Promise<void> {
  try {
    const supabase = requireService();
    await supabase.from("experience_21d_funnel_events").upsert(
      {
        analysis_session_id: input.analysisSessionId,
        interest_id: input.interestId ?? null,
        event: input.event,
      },
      { onConflict: "analysis_session_id,event", ignoreDuplicates: true },
    );
  } catch {
    /* funnel is best-effort; never block consumer report */
  }
}

async function loadSessionAttribution(sessionId: string) {
  const supabase = requireService();
  const { data, error } = await supabase
    .from("analysis_sessions")
    .select("id, source_type, growth_share_id, quiz_share_code, referrer_member_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) {
    throw new AnalysisSessionError("Analysis session not found.", 404, "not_found");
  }
  let growthShareOwnerMemberId: string | null = null;
  if (data.growth_share_id) {
    const share = await supabase
      .from("growth_shares")
      .select("owner_member_id")
      .eq("id", data.growth_share_id)
      .maybeSingle();
    growthShareOwnerMemberId = share.data?.owner_member_id ? String(share.data.owner_member_id) : null;
  }
  return {
    sourceType: data.source_type as AnalysisSourceType,
    growthShareId: data.growth_share_id as string | null,
    growthShareOwnerMemberId,
    quizShareCode: data.quiz_share_code as string | null,
    referrerMemberId: data.referrer_member_id as string | null,
  };
}

async function findOwnedCustomerId(ownerMemberId: string, contact: Experience21dContactInput): Promise<string | null> {
  if (contact.channel !== "phone") return null;
  const supabase = requireService();
  const { data } = await supabase
    .from("customers")
    .select("id, phone")
    .eq("owner_member_id", ownerMemberId)
    .not("phone", "is", null);
  const match = (data ?? []).find(
    (row) => row.phone && normalizeCustomerPhone(String(row.phone)) === contact.value,
  );
  return match?.id ? String(match.id) : null;
}

export async function getInterestBySessionId(sessionId: string): Promise<InterestRow | null> {
  const supabase = requireService();
  const { data } = await supabase
    .from("experience_21d_interests")
    .select("*")
    .eq("analysis_session_id", sessionId)
    .maybeSingle();
  return (data as InterestRow | null) ?? null;
}

export async function request21dInterest(input: {
  analysisSessionId: string;
  session: ResetSession;
  contact?: {
    displayName?: string | null;
    channel?: string | null;
    value?: string | null;
  } | null;
  consultationPreference?: Experience21dConsultationPreference | null;
  landingPageVersion?: string | null;
}): Promise<{ public: Experience21dPublicHandoff; created: boolean }> {
  if (input.session.act !== "report" || !input.session.report) {
    throw new AnalysisSessionError("Report is not ready.", 409, "report_not_ready");
  }
  await record21dFunnelEvent({
    analysisSessionId: input.analysisSessionId,
    event: "21d_interest_clicked",
  });
  const existing = await getInterestBySessionId(input.analysisSessionId);
  const preference =
    input.consultationPreference && isExperience21dConsultationPreference(input.consultationPreference)
      ? input.consultationPreference
      : null;
  const landingPageVersion = input.landingPageVersion?.trim() || null;

  // Idempotent: already submitted with usable contact (+ optional preference already set).
  if (existing && hasUsableContact(existing)) {
    if (preference && existing.consultation_preference !== preference) {
      const supabase = requireService();
      const patch = {
        consultation_preference: preference,
        landing_page_version: landingPageVersion ?? existing.landing_page_version ?? EXPERIENCE_21D_LANDING_VERSION,
        brief_json: {
          ...(existing.brief_json ?? {}),
          consultation_preference: preference,
          landing_page_version: landingPageVersion ?? existing.landing_page_version ?? EXPERIENCE_21D_LANDING_VERSION,
        },
        updated_at: new Date().toISOString(),
      };
      let { data: updated, error: updateError } = await supabase
        .from("experience_21d_interests")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (updateError && /consultation_preference|landing_page_version|schema cache/i.test(updateError.message)) {
        const retry = await supabase
          .from("experience_21d_interests")
          .update({
            brief_json: patch.brief_json,
            updated_at: patch.updated_at,
          })
          .eq("id", existing.id)
          .select("*")
          .maybeSingle();
        updated = retry.data;
        updateError = retry.error;
      }
      if (!updateError && updated) {
        await record21dFunnelEvent({
          analysisSessionId: input.analysisSessionId,
          event: "21d_consultation_submitted",
          interestId: String(updated.id),
        });
        return { public: toPublicHandoff(input.session, updated as InterestRow)!, created: false };
      }
    }
    return { public: toPublicHandoff(input.session, existing)!, created: false };
  }

  const parsed = parse21dContact(input.contact ?? {});
  if (!parsed) {
    return {
      public: {
        invitation: build21dInvitation(input.session.report),
        interest: { state: "needs_contact", needsContact: true },
      },
      created: false,
    };
  }
  const attribution = await loadSessionAttribution(input.analysisSessionId);
  const ownership = resolve21dOwnership(attribution);
  const customerId = ownership.ownerMemberId
    ? await findOwnedCustomerId(ownership.ownerMemberId, parsed)
    : null;
  const brief = compileCoachHandoffBrief({
    report: input.session.report,
    turns: input.session.conversation.turns,
    quizPrimary: input.session.quiz.result?.primaryType ?? input.session.animal?.type ?? null,
  });
  const invitation = build21dInvitation(input.session.report);
  const supabase = requireService();
  const briefPayload =
    preference != null
      ? {
          ...brief,
          consultation_preference: preference,
          landing_page_version: landingPageVersion ?? EXPERIENCE_21D_LANDING_VERSION,
        }
      : brief;
  const payload = {
    analysis_session_id: input.analysisSessionId,
    customer_id: customerId,
    owner_member_id: ownership.ownerMemberId,
    source: EXPERIENCE_21D_SOURCE,
    status: "interested" as const,
    attribution_source_type: ownership.attributionSourceType,
    growth_share_id: ownership.growthShareId,
    quiz_share_code: ownership.quizShareCode,
    referrer_member_id: ownership.referrerMemberId,
    primary_animal_type: input.session.quiz.result?.primaryType ?? input.session.animal?.type ?? null,
    secondary_animal_type: input.session.quiz.result?.secondaryType ?? null,
    display_name: parsed.displayName,
    contact_channel: parsed.channel,
    contact_value: parsed.value,
    consultation_preference: preference,
    landing_page_version: preference
      ? landingPageVersion ?? EXPERIENCE_21D_LANDING_VERSION
      : landingPageVersion,
    invitation_bridge: invitation.bridge,
    brief_json: briefPayload,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("experience_21d_interests")
    .upsert(payload, { onConflict: "analysis_session_id" })
    .select("*")
    .maybeSingle();
  let saved = data as InterestRow | null;
  let saveError = error;
  // Preview may run before additive 063 is applied; keep preference in brief_json.
  if (
    saveError &&
    /consultation_preference|landing_page_version|schema cache/i.test(saveError.message)
  ) {
    const {
      consultation_preference: _pref,
      landing_page_version: _ver,
      ...legacyPayload
    } = payload;
    const retry = await supabase
      .from("experience_21d_interests")
      .upsert(legacyPayload, { onConflict: "analysis_session_id" })
      .select("*")
      .maybeSingle();
    saved = retry.data as InterestRow | null;
    saveError = retry.error;
  }
  if (saveError || !saved) {
    const raced = await getInterestBySessionId(input.analysisSessionId);
    if (raced && hasUsableContact(raced)) {
      return { public: toPublicHandoff(input.session, raced)!, created: false };
    }
    throw new AnalysisSessionError(saveError?.message || "Failed to save interest.", 500, "interest_failed");
  }
  await record21dFunnelEvent({
    analysisSessionId: input.analysisSessionId,
    event: "21d_contact_captured",
    interestId: String(saved.id),
  });
  await record21dFunnelEvent({
    analysisSessionId: input.analysisSessionId,
    event: "21d_interest_created",
    interestId: String(saved.id),
  });
  if (preference) {
    await record21dFunnelEvent({
      analysisSessionId: input.analysisSessionId,
      event: "21d_consultation_submitted",
      interestId: String(saved.id),
    });
  }
  return { public: toPublicHandoff(input.session, saved)!, created: true };
}

export type Partner21dCard = {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  status: Experience21dStatus;
  whyNow: string;
  realBottleneck: string;
  contactChannel: string | null;
  contactValue: string | null;
  animalType: string | null;
  animalLabel: string;
};

function partnerCard(row: InterestRow): Partner21dCard {
  const brief = row.brief_json ?? ({} as CoachHandoffBrief);
  const animal = animalPresentation(row.primary_animal_type);
  return {
    id: row.id,
    displayName: row.display_name || "尚未留名",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source,
    status: row.status,
    whyNow: brief.why_now ?? "",
    realBottleneck: brief.real_bottleneck ?? "",
    contactChannel: row.contact_channel,
    contactValue: row.contact_value,
    animalType: row.primary_animal_type,
    animalLabel: animal.label,
  };
}

export type Partner21dSummary = {
  waiting: number;
  contacted: number;
  joined: number;
  declined: number;
  monthNew: number;
  badge: number;
};

export function summarizePartner21dInterests(
  rows: Array<Pick<Partner21dCard, "status" | "createdAt">>,
  now = new Date(),
): Partner21dSummary {
  const monthStart = monthNewStartIso(now);
  const summary: Partner21dSummary = {
    waiting: 0,
    contacted: 0,
    joined: 0,
    declined: 0,
    monthNew: 0,
    badge: 0,
  };
  for (const row of rows) {
    if (row.status === "interested") {
      summary.waiting += 1;
      summary.badge += 1;
    } else if (row.status === "contacted" || row.status === "considering") {
      summary.contacted += 1;
    } else if (row.status === "joined") {
      summary.joined += 1;
    } else if (row.status === "declined") {
      summary.declined += 1;
    }
    if (row.createdAt >= monthStart) summary.monthNew += 1;
  }
  return summary;
}

export async function countPartner21dWaiting(ownerMemberId: string): Promise<number> {
  const supabase = requireService();
  const { count, error } = await supabase
    .from("experience_21d_interests")
    .select("id", { count: "exact", head: true })
    .eq("owner_member_id", ownerMemberId)
    .eq("status", "interested")
    .is("archived_at", null);
  if (error) throw new AnalysisSessionError(error.message, 500, "badge_failed");
  return count ?? 0;
}

export async function listPartner21dInterests(ownerMemberId: string): Promise<Partner21dCard[]> {
  const supabase = requireService();
  const { data, error } = await supabase
    .from("experience_21d_interests")
    .select("*")
    .eq("owner_member_id", ownerMemberId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new AnalysisSessionError(error.message, 500, "list_failed");
  return sortQuizPartnerLeads(((data ?? []) as InterestRow[]).map(partnerCard));
}

export async function getPartner21dInterest(
  ownerMemberId: string,
  interestId: string,
): Promise<{
  card: Partner21dCard;
  brief: CoachHandoffBrief;
  contactChannel: string | null;
  contactValue: string | null;
  analysis: { report: ResetSession["report"]; turns: Array<{ role: string; text: string }>; animalType: string | null };
} | null> {
  const supabase = requireService();
  const { data } = await supabase
    .from("experience_21d_interests")
    .select("*")
    .eq("id", interestId)
    .eq("owner_member_id", ownerMemberId)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;
  const row = data as InterestRow;
  await record21dFunnelEvent({
    analysisSessionId: row.analysis_session_id,
    event: "21d_partner_viewed",
    interestId: row.id,
  });
  const sessionRow = await supabase
    .from("analysis_sessions")
    .select("answers_json")
    .eq("id", row.analysis_session_id)
    .maybeSingle();
  const packed = (sessionRow.data?.answers_json as Record<string, unknown> | null) ?? {};
  const reset = packed[RESET_META_KEY] as ResetSession | undefined;
  return {
    card: partnerCard(row),
    brief: row.brief_json,
    contactChannel: row.contact_channel,
    contactValue: row.contact_value,
    analysis: {
      report: reset?.report ?? null,
      turns: (reset?.conversation.turns ?? []).map((turn) => ({ role: turn.role, text: turn.text })),
      animalType: reset?.animal?.type ?? row.primary_animal_type,
    },
  };
}

export async function markPartner21dContacted(ownerMemberId: string, interestId: string): Promise<Partner21dCard | null> {
  return markPartner21dStatus(ownerMemberId, interestId, "contacted");
}

export async function markPartner21dStatus(
  ownerMemberId: string,
  interestId: string,
  next: "contacted" | "joined" | "declined",
): Promise<Partner21dCard | null> {
  const supabase = requireService();
  const { data: current } = await supabase
    .from("experience_21d_interests")
    .select("*")
    .eq("id", interestId)
    .eq("owner_member_id", ownerMemberId)
    .is("archived_at", null)
    .maybeSingle();
  if (!current) return null;
  const row = current as InterestRow;
  if (next === "contacted") {
    if (row.status === "joined" || row.status === "declined") return null;
    if (row.status === "contacted" || row.status === "considering") return partnerCard(row);
  } else if (row.status !== "contacted" && row.status !== "considering") {
    return null;
  }

  const { data, error } = await supabase
    .from("experience_21d_interests")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", interestId)
    .eq("owner_member_id", ownerMemberId)
    .is("archived_at", null)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  const updated = data as InterestRow;
  if (next === "contacted") {
    await record21dFunnelEvent({
      analysisSessionId: updated.analysis_session_id,
      event: "21d_contacted",
      interestId: updated.id,
    });
  }
  return partnerCard(updated);
}

/** Owner-only operational hide. Never physical DELETE. Preserves session, funnel events, brief, contact. */
export async function archivePartner21dInterest(
  ownerMemberId: string,
  interestId: string,
): Promise<Partner21dCard | null> {
  const supabase = requireService();
  const archivedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("experience_21d_interests")
    .update({ archived_at: archivedAt, updated_at: archivedAt })
    .eq("id", interestId)
    .eq("owner_member_id", ownerMemberId)
    .is("archived_at", null)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return partnerCard(data as InterestRow);
}

export async function assertPublicTokenCannotReadBrief(token: string): Promise<boolean> {
  if (!isPlausibleAnalysisSessionToken(token)) return true;
  const supabase = requireService();
  const { data } = await supabase
    .from("analysis_sessions")
    .select("id")
    .eq("token_hash", hashAnalysisSessionToken(token))
    .maybeSingle();
  if (!data) return true;
  const interest = await getInterestBySessionId(String(data.id));
  return !interest || Boolean(interest.brief_json);
}
