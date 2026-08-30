import { buildCoachingGenerationInput } from "@/lib/coaching/ai/build-coaching-generation-input";
import {
  getCoachDirectivesForEnrollment,
  listCoachingAiOutputsForEnrollment,
} from "@/lib/coaching/ai/coaching-ai-store";
import { extractCoachingMealPhotoCandidates } from "@/lib/coaching/ai/select-coaching-photos-for-generation";
import { buildRecentCoachActionMemory } from "@/lib/coaching/coach-actions/build-recent-coach-action-memory";
import { listCoachingCoachActionsForEnrollment } from "@/lib/coaching/coach-actions/coaching-coach-action-service";
import {
  listActiveStructuredDirectivesForDay,
  type CoachDirectiveRecord,
} from "@/lib/coaching/coach-directives/coach-directive-service";
import type { StructuredCoachDirective } from "@/lib/coaching/directive-meal-verification";
import {
  getCoachingDailyLogDetail,
  getCoachingEnrollmentForCoach,
  listCoachingDailyLogsForEnrollment,
} from "@/lib/coaching/coaching-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { BodyCompositionRecord, Customer } from "@/types/customer";

export function mapBodyRecordRow(row: Record<string, unknown>): BodyCompositionRecord {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    recordDate: String(row.record_date),
    age: row.age != null ? Number(row.age) : null,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    skeletalMuscleKg: row.skeletal_muscle_kg != null ? Number(row.skeletal_muscle_kg) : null,
    bodyFatKg: row.body_fat_kg != null ? Number(row.body_fat_kg) : null,
    bmi: row.bmi != null ? Number(row.bmi) : null,
    bodyFatPercent: row.body_fat_percent != null ? Number(row.body_fat_percent) : null,
    visceralFatLevel: row.visceral_fat_level != null ? Number(row.visceral_fat_level) : null,
    basalMetabolicRate: row.basal_metabolic_rate != null ? Number(row.basal_metabolic_rate) : null,
    bodyAge: row.body_age != null ? Number(row.body_age) : null,
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export type LoadedCoachingGenerationContext = {
  generationInput: CoachingGenerationInput;
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
  /** Reuse in worker — do not re-fetch daily log. */
  todayLog: CoachingDailyLogDetail;
  /** Reuse for prior photo-hash scans — do not re-list. */
  recentLogs: CoachingDailyLogDetail[];
  /** Active structured directives for logDate — reuse for CD verification. */
  activeStructuredDirectives: StructuredCoachDirective[];
  /** Enrollment timestamps for V2 lifecycle. */
  enrollmentStartedAt: string | null;
  enrollmentPlannedEndAt: string | null;
};

/**
 * Authoritative generation context.
 * Independent Supabase reads run in Promise.all after enrollment resolve.
 */
export async function loadAuthoritativeCoachingGenerationInput(input: {
  enrollmentId: string;
  ownerMemberId: string;
  logDate: string;
}): Promise<LoadedCoachingGenerationContext> {
  const enrollment = await getCoachingEnrollmentForCoach({
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
  });

  const supabase = createSupabaseServiceClient();

  const [
    customerResult,
    todayLog,
    recentLogs,
    bodyResult,
    coachDirectives,
    priorOutputs,
    coachActions,
    activeStructuredDirectives,
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id, display_name, height_cm, sex, region, occupation")
      .eq("id", enrollment.customerId)
      .maybeSingle(),
    getCoachingDailyLogDetail({
      enrollmentId: enrollment.id,
      logDate: input.logDate,
      ownerMemberId: enrollment.ownerMemberId,
    }),
    listCoachingDailyLogsForEnrollment({
      enrollmentId: enrollment.id,
      ownerMemberId: enrollment.ownerMemberId,
      limit: 14,
    }),
    supabase
      .from("body_composition_records")
      .select("*")
      .eq("customer_id", enrollment.customerId)
      .order("record_date", { ascending: false }),
    getCoachDirectivesForEnrollment(enrollment.id),
    listCoachingAiOutputsForEnrollment({
      enrollmentId: enrollment.id,
      limit: 14,
    }),
    listCoachingCoachActionsForEnrollment({
      enrollmentId: enrollment.id,
      ownerMemberId: enrollment.ownerMemberId,
      limit: 20,
    }),
    listActiveStructuredDirectivesForDay({
      enrollmentId: enrollment.id,
      logDate: input.logDate,
    }),
  ]);

  if (customerResult.error) {
    throw new Error(customerResult.error.message);
  }
  if (!customerResult.data) {
    throw new Error("Customer not found for coaching generation.");
  }
  if (bodyResult.error) {
    throw new Error(bodyResult.error.message);
  }

  const customerRow = customerResult.data;
  const customer: Pick<Customer, "displayName" | "heightCm" | "sex" | "region" | "occupation"> = {
    displayName: String(customerRow.display_name ?? "顧客"),
    heightCm: customerRow.height_cm != null ? Number(customerRow.height_cm) : undefined,
    sex: customerRow.sex != null ? (String(customerRow.sex) as Customer["sex"]) : undefined,
    region: customerRow.region != null ? String(customerRow.region) : undefined,
    occupation: customerRow.occupation != null ? String(customerRow.occupation) : undefined,
  };

  const recentCoachActionMemory = buildRecentCoachActionMemory(coachActions);
  const photoCandidates = extractCoachingMealPhotoCandidates(todayLog);
  const generationInput = buildCoachingGenerationInput({
    enrollment,
    customer,
    logDate: input.logDate,
    todayLog,
    recentLogs,
    bodyRecords: (bodyResult.data ?? []).map((row) =>
      mapBodyRecordRow(row as Record<string, unknown>),
    ),
    coachDirectives: coachDirectives ?? undefined,
    recentCoachActionMemory,
    priorCompletedOutputs: priorOutputs
      .filter((output) => output.status === "completed" && output.outputJson)
      .map((output) => ({
        id: output.id,
        logDate: output.logDate,
        status: output.status,
        outputJson: output.outputJson!,
      })),
    photoCandidates,
  });

  return {
    generationInput,
    enrollmentId: enrollment.id,
    customerId: enrollment.customerId,
    ownerMemberId: enrollment.ownerMemberId,
    logDate: input.logDate,
    todayLog,
    recentLogs,
    activeStructuredDirectives,
    enrollmentStartedAt: enrollment.startedAt ?? null,
    enrollmentPlannedEndAt: enrollment.plannedEndAt ?? null,
  };
}

/** @internal test helper — enrollment type re-export unused outside. */
export type { CoachingEnrollment, CoachDirectiveRecord };
