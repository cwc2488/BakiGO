import { AnalysisSessionError, requireAnalysisSessionRowByToken } from "@/lib/analysis/analysis-session-service";
import { isPlausibleAnalysisSessionToken } from "@/lib/analysis/analysis-session-token";
import { hasUsableContact } from "@/lib/analysis/handoff/experience-21d-contact";
import {
  getInterestBySessionId,
  record21dFunnelEvent,
  request21dInterest,
} from "@/lib/analysis/handoff/experience-21d-service";
import { isResetSession, readResetSession } from "@/lib/analysis/reset/reset-contract";
import { isResetPreviewAllowed } from "@/lib/analysis/reset/reset-path";
import { getResetExperience } from "@/lib/analysis/reset/reset-service";
import {
  EXPERIENCE_21D_LANDING_VERSION,
  isExperience21dConsultationPreference,
  type Experience21dConsultationPreference,
} from "@/lib/experience/experience-21d-landing-copy";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export type Experience21dLandingContext = {
  token: string;
  reportReady: boolean;
  animalType: string | null;
  bridge: string | null;
  interestState: "none" | "needs_contact" | "created";
  needsContact: boolean;
  displayName: string | null;
  contactChannel: string | null;
  consultationPreference: Experience21dConsultationPreference | null;
  landingPageVersion: string;
};

function requirePreview() {
  if (!isResetPreviewAllowed()) {
    throw new AnalysisSessionError("not_found", 404, "not_found");
  }
}

export async function loadExperience21dLandingContext(token: string): Promise<Experience21dLandingContext> {
  requirePreview();
  if (!isSupabaseServiceConfigured()) {
    throw new AnalysisSessionError("Analysis service unavailable.", 503, "service_unavailable");
  }
  if (!isPlausibleAnalysisSessionToken(token)) {
    throw new AnalysisSessionError("Invalid session.", 404, "not_found");
  }

  const loaded = await getResetExperience(token);
  if (loaded.kind !== "reset") {
    throw new AnalysisSessionError("Reset session missing.", 409, "not_started");
  }
  const experience = loaded.experience;
  if (experience.act !== "report" || !experience.report) {
    throw new AnalysisSessionError("Report is not ready.", 409, "report_not_ready");
  }

  const row = await requireAnalysisSessionRowByToken(token);
  const interest = await getInterestBySessionId(row.id);
  await record21dFunnelEvent({
    analysisSessionId: row.id,
    event: "21d_landing_viewed",
    interestId: interest?.id ?? null,
  });

  const created = hasUsableContact(interest);
  const preference = interest?.consultation_preference ?? null;

  return {
    token,
    reportReady: true,
    animalType: experience.animal?.type ?? null,
    bridge: experience.handoff?.invitation.bridge ?? null,
    interestState: created
      ? "created"
      : experience.handoff?.interest.state === "needs_contact"
        ? "needs_contact"
        : "none",
    needsContact: !created,
    displayName: interest?.display_name ?? null,
    contactChannel: interest?.contact_channel ?? null,
    consultationPreference: isExperience21dConsultationPreference(preference) ? preference : null,
    landingPageVersion: EXPERIENCE_21D_LANDING_VERSION,
  };
}

export async function submitExperience21dConsultation(input: {
  token: string;
  consultationPreference: unknown;
  displayName?: string | null;
  channel?: string | null;
  value?: string | null;
}): Promise<{
  ok: true;
  created: boolean;
  duplicate: boolean;
  interestState: "created" | "needs_contact";
  consultationPreference: Experience21dConsultationPreference;
}> {
  requirePreview();
  if (!isSupabaseServiceConfigured()) {
    throw new AnalysisSessionError("Analysis service unavailable.", 503, "service_unavailable");
  }
  if (!isExperience21dConsultationPreference(input.consultationPreference)) {
    throw new AnalysisSessionError("請選擇諮詢方式。", 400, "preference_required");
  }

  const row = await requireAnalysisSessionRowByToken(input.token);
  const answers = (row.answers_json as Record<string, unknown> | null) ?? {};
  if (!isResetSession(answers)) {
    throw new AnalysisSessionError("Reset session missing.", 409, "not_started");
  }
  const session = readResetSession(answers)!;
  if (session.act !== "report" || !session.report) {
    throw new AnalysisSessionError("Report is not ready.", 409, "report_not_ready");
  }

  await record21dFunnelEvent({ analysisSessionId: row.id, event: "21d_consultation_started" });
  await record21dFunnelEvent({ analysisSessionId: row.id, event: "21d_consultation_method_selected" });

  const before = await getInterestBySessionId(row.id);
  const alreadyComplete =
    Boolean(before) &&
    hasUsableContact(before) &&
    before?.consultation_preference === input.consultationPreference;

  const result = await request21dInterest({
    analysisSessionId: row.id,
    session,
    contact: {
      displayName: input.displayName ?? before?.display_name,
      channel: input.channel ?? before?.contact_channel,
      value: input.value ?? before?.contact_value,
    },
    consultationPreference: input.consultationPreference,
    landingPageVersion: EXPERIENCE_21D_LANDING_VERSION,
  });

  if (result.public.interest.state === "needs_contact") {
    return {
      ok: true,
      created: false,
      duplicate: false,
      interestState: "needs_contact",
      consultationPreference: input.consultationPreference,
    };
  }

  return {
    ok: true,
    created: result.created,
    duplicate: Boolean(alreadyComplete) || (!result.created && result.public.interest.state === "created"),
    interestState: "created",
    consultationPreference: input.consultationPreference,
  };
}
