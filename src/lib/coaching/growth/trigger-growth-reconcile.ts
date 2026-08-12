import { mapBodyRecordRow } from "@/lib/coaching/ai/load-coaching-generation-context";
import { buildGrowthIntelligence } from "@/lib/coaching/growth/build-growth-intelligence";
import { getLatestExperienceCheckin } from "@/lib/coaching/growth/experience-checkin-service";
import { persistGrowthMatrixEvaluation } from "@/lib/coaching/growth/growth-opportunity-service";
import { getCoachingEnrollmentForCoach } from "@/lib/coaching/coaching-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";

/**
 * Best-effort event reconcile. Never throws to callers.
 */
export async function triggerGrowthReconcileBestEffort(input: {
  enrollmentId: string;
  ownerMemberId: string;
  logDate?: string;
  forceCoachAttention?: boolean;
}): Promise<void> {
  try {
    const enrollment = await getCoachingEnrollmentForCoach({
      enrollmentId: input.enrollmentId,
      ownerMemberId: input.ownerMemberId,
    });
    const logDate = input.logDate ?? coachingTodayLogDate();
    const supabase = createSupabaseServiceClient();
    const { data: bodyRows } = await supabase
      .from("body_composition_records")
      .select("*")
      .eq("customer_id", enrollment.customerId)
      .order("record_date", { ascending: false });
    const checkin = await getLatestExperienceCheckin({
      enrollmentId: input.enrollmentId,
      ownerMemberId: input.ownerMemberId,
    }).catch(() => null);

    const matrix = buildGrowthIntelligence({
      enrollment,
      ownerMemberId: input.ownerMemberId,
      bodyRecords: (bodyRows ?? []).map((row) => mapBodyRecordRow(row as Record<string, unknown>)),
      logDate,
      checkin,
      attentionTier: input.forceCoachAttention ? "coach_attention" : "routine",
      finalInterventionLevel: input.forceCoachAttention ? "coach_attention" : "normal",
    });

    await persistGrowthMatrixEvaluation({
      enrollmentId: input.enrollmentId,
      ownerMemberId: input.ownerMemberId,
      matrix,
      asOfIso: new Date().toISOString(),
    });

    // Rescue > Growth: pause active referral CTAs when Growth becomes blocked.
    if (matrix.blockedReasons.length > 0 || !matrix.shouldOpen) {
      const { pauseActiveSharesForCustomer } = await import(
        "@/lib/coaching/referral-share/share-service"
      );
      await pauseActiveSharesForCustomer({
        ownerMemberId: input.ownerMemberId,
        customerId: enrollment.customerId,
      }).catch(() => undefined);
    }
  } catch {
    // best-effort
  }
}
