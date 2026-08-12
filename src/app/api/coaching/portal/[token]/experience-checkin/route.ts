import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  resolveActiveCoachingPortal,
} from "@/lib/coaching/coaching-service";
import { mapBodyRecordRow } from "@/lib/coaching/ai/load-coaching-generation-context";
import { buildGrowthIntelligence } from "@/lib/coaching/growth/build-growth-intelligence";
import {
  assessCheckinTriggerEligibility,
  getLatestExperienceCheckinForPortal,
  submitExperienceCheckinForPortal,
} from "@/lib/coaching/growth/experience-checkin-service";
import { persistGrowthMatrixEvaluation } from "@/lib/coaching/growth/growth-opportunity-service";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { isCheckinTriggerReason, type FeltChangeConsent } from "@/types/coaching-growth";

export const runtime = "nodejs";

/**
 * Customer portal Experience Check-in.
 * Returns own check-in + trigger eligibility only — never Growth Opportunity / Matrix internals.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    if (!portal) {
      return NextResponse.json({ error: "連結無效或已過期" }, { status: 404 });
    }

    const latest = await getLatestExperienceCheckinForPortal({
      enrollmentId: portal.enrollmentId,
      ownerMemberId: portal.ownerMemberId,
      customerId: portal.customerId,
    });

    const gate = assessCheckinTriggerEligibility({
      latest,
      asOfIso: new Date().toISOString(),
      attentionIsCoachAttention: false,
      triggerReason: "recheck",
    });

    return NextResponse.json({
      ok: true,
      latestCheckin: latest
        ? {
            respondedAt: latest.respondedAt,
            outcomePerception: latest.outcomePerception,
            coachHelpfulness: latest.coachHelpfulness,
            experienceSatisfaction: latest.experienceSatisfaction,
            recommendationWillingness: latest.recommendationWillingness,
            mostFeltChangeText: latest.mostFeltChangeText,
            mostFeltChangeConsent: latest.mostFeltChangeConsent,
          }
        : null,
      canSubmit: gate.eligible,
      cooldownReason: gate.eligible ? null : gate.reason,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load check-in.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    if (!portal) {
      return NextResponse.json({ error: "連結無效或已過期" }, { status: 404 });
    }

    const body = (await request.json()) as {
      triggerReason?: string;
      outcomePerception?: number | null;
      coachHelpfulness?: number | null;
      experienceSatisfaction?: number | null;
      recommendationWillingness?: number | null;
      mostFeltChangeText?: string | null;
      mostFeltChangeConsent?: FeltChangeConsent;
      struggleFlag?: boolean;
      declineGrowthAsk?: boolean;
    };

    const triggerReason =
      body.triggerReason && isCheckinTriggerReason(body.triggerReason)
        ? body.triggerReason
        : "milestone";

    const checkin = await submitExperienceCheckinForPortal({
      ownerMemberId: portal.ownerMemberId,
      customerId: portal.customerId,
      enrollmentId: portal.enrollmentId,
      payload: {
        triggerReason,
        asOfLogDate: coachingTodayLogDate(),
        outcomePerception: body.outcomePerception ?? null,
        coachHelpfulness: body.coachHelpfulness ?? null,
        experienceSatisfaction: body.experienceSatisfaction ?? null,
        recommendationWillingness: body.recommendationWillingness ?? null,
        mostFeltChangeText: body.mostFeltChangeText ?? null,
        mostFeltChangeConsent: body.mostFeltChangeConsent ?? "coach_only",
        struggleFlag: Boolean(body.struggleFlag),
        declineGrowthAsk: Boolean(body.declineGrowthAsk),
        explicitReferralIntent: false,
      },
    });

    // Event: check-in submitted → reconcile Growth (server-side; Customer never sees opportunity)
    try {
      const supabase = createSupabaseServiceClient();
      const [{ data: enrollment }, { data: bodyRows }] = await Promise.all([
        supabase
          .from("coaching_enrollments")
          .select("id, customer_id, owner_member_id, goal, started_at, baseline_body_record_id")
          .eq("id", portal.enrollmentId)
          .maybeSingle(),
        supabase
          .from("body_composition_records")
          .select("*")
          .eq("customer_id", portal.customerId)
          .order("record_date", { ascending: false }),
      ]);
      if (enrollment) {
        const matrix = buildGrowthIntelligence({
          enrollment: {
            id: String(enrollment.id),
            customerId: String(enrollment.customer_id),
            ownerMemberId: String(enrollment.owner_member_id),
            goal: enrollment.goal != null ? String(enrollment.goal) : null,
            startedAt: String(enrollment.started_at),
            baselineBodyRecordId:
              enrollment.baseline_body_record_id != null
                ? String(enrollment.baseline_body_record_id)
                : null,
          },
          ownerMemberId: portal.ownerMemberId,
          bodyRecords: (bodyRows ?? []).map((row) => mapBodyRecordRow(row as Record<string, unknown>)),
          logDate: coachingTodayLogDate(),
          checkin,
          attentionTier: "routine",
          finalInterventionLevel: "normal",
        });
        await persistGrowthMatrixEvaluation({
          enrollmentId: portal.enrollmentId,
          ownerMemberId: portal.ownerMemberId,
          matrix,
          asOfIso: new Date().toISOString(),
        });
      }
    } catch {
      // Check-in already saved; reconcile best-effort
    }

    return NextResponse.json({
      ok: true,
      checkin: {
        respondedAt: checkin.respondedAt,
        outcomePerception: checkin.outcomePerception,
        coachHelpfulness: checkin.coachHelpfulness,
        experienceSatisfaction: checkin.experienceSatisfaction,
        recommendationWillingness: checkin.recommendationWillingness,
        mostFeltChangeText: checkin.mostFeltChangeText,
        mostFeltChangeConsent: checkin.mostFeltChangeConsent,
      },
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to submit check-in.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
