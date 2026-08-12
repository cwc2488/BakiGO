/**
 * Phase 3d Preview Gate — build-time only.
 * Invoked via temporary package.json build hook on Vercel Preview.
 * Logs PASS/FAIL only. Never prints secrets / service role / OpenAI keys.
 */
import { createClient } from "@supabase/supabase-js";
import { buildCoachingAiFixtureGenerationInput } from "../src/lib/coaching/ai/coaching-ai-fixtures";
import { buildScenarioDecisionContext } from "../src/lib/coaching/ai/build-scenario-decision-context";
import {
  OpenAiCoachingAiProvider,
  parseDailyCoachProviderJson,
} from "../src/lib/coaching/ai/coaching-ai-provider";
import { evaluateCoachingAiOutputQuality } from "../src/lib/coaching/ai/coaching-ai-quality-check";
import { extractCustomerVoiceSignals } from "../src/lib/coaching/ai/extract-customer-voice";
import { observeCoachingMeals } from "../src/lib/coaching/ai/observe-coaching-meals";
import { loadPreparedCoachingEvalMealImages } from "../src/lib/coaching/ai/coaching-eval-fixture-images";
import { buildCoachingDecisionContext } from "../src/lib/coaching/ai/coaching-signal-engine";
import { applyCoachingDecisionContextToOutput } from "../src/lib/coaching/ai/apply-coaching-decision-context";
import { assessCoachAttention } from "../src/lib/coaching/attention/assess-coach-attention";
import { buildDenseSubmissionCalendar } from "../src/lib/coaching/attention/build-dense-submission-calendar";
import { buildRecentCoachActionMemory } from "../src/lib/coaching/coach-actions/build-recent-coach-action-memory";
import {
  buildRelevantCoachActionContext,
  relevantCoachActionContextAsOfIso,
} from "../src/lib/coaching/coach-actions/build-relevant-coach-action-context";
import { buildCoachActionTimelineEvents } from "../src/lib/coaching/timeline/build-coach-action-timeline-events";
import { filterTimelineEvents } from "../src/lib/coaching/timeline/build-timeline-events";
import {
  mapCoachActionToAttentionShape,
  inferCoachActionMaterial,
  type CoachingCoachActionRecord,
} from "../src/types/coaching-coach-actions";
import type { CoachingDailyGenerationOutputJson } from "../src/types/coaching-ai";

function available(name: string): "available" | "unavailable" {
  const value = process.env[name]?.trim() ?? "";
  if (!value || value === "[SENSITIVE]" || value.length < 8) return "unavailable";
  return "available";
}

function printChunked(label: string, payload: unknown): void {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const chunkSize = 1200;
  const total = Math.max(1, Math.ceil(encoded.length / chunkSize));
  console.log(`${label}_META:${JSON.stringify({ bytes: encoded.length, chunks: total })}`);
  for (let i = 0; i < total; i += 1) {
    console.log(`${label}_CHUNK:${i}:${total}:${encoded.slice(i * chunkSize, (i + 1) * chunkSize)}`);
  }
  console.log(`${label}_END`);
}

function denseSubmittedCalendar(asOfLogDate: string, days: number) {
  return buildDenseSubmissionCalendar({
    asOfLogDate,
    windowDays: days,
    logs: Array.from({ length: days }, (_, index) => {
      const [y, m, d] = asOfLogDate.split("-").map(Number);
      const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      anchor.setUTCDate(anchor.getUTCDate() - (days - 1 - index));
      const date = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
      return { logDate: date, submitted: true };
    }),
  });
}

function mapRow(row: Record<string, unknown>): CoachingCoachActionRecord {
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id),
    customerId: String(row.customer_id),
    ownerMemberId: String(row.owner_member_id),
    actionType: String(row.action_type) as CoachingCoachActionRecord["actionType"],
    status: String(row.status) as CoachingCoachActionRecord["status"],
    note: row.note != null ? String(row.note) : null,
    relatedReasonCodes: Array.isArray(row.related_reason_codes)
      ? row.related_reason_codes.map((item) => String(item))
      : [],
    evidenceRefs: Array.isArray(row.evidence_refs) ? (row.evidence_refs as never[]) : [],
    relatedLogDate: row.related_log_date != null ? String(row.related_log_date) : null,
    relatedMeasurementId: row.related_measurement_id != null ? String(row.related_measurement_id) : null,
    isMaterial: Boolean(row.is_material),
    supersededBy: row.superseded_by != null ? String(row.superseded_by) : null,
    createdAt: String(row.created_at ?? ""),
    resolvedAt: row.resolved_at != null ? String(row.resolved_at) : null,
    updatedAt: String(row.updated_at ?? ""),
  };
}

async function runDbSmoke() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const out: Record<string, unknown> = {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: available("NEXT_PUBLIC_SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: available("SUPABASE_SERVICE_ROLE_KEY"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: available("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    },
  };

  if (
    available("NEXT_PUBLIC_SUPABASE_URL") === "unavailable" ||
    available("SUPABASE_SERVICE_ROLE_KEY") === "unavailable"
  ) {
    out.ok = false;
    out.error = "missing_supabase_runtime_env";
    return out;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: enrollments, error: enrollError } = await supabase
    .from("coaching_enrollments")
    .select("id, customer_id, owner_member_id, status, started_at")
    .eq("status", "active")
    .limit(1);
  if (enrollError || !enrollments?.[0]) {
    out.ok = false;
    out.error = enrollError?.message ?? "no_active_enrollment";
    return out;
  }
  const enrollment = enrollments[0];
  out.enrollmentIdPrefix = String(enrollment.id).slice(0, 8);

  const note = "Phase3d preview gate: 最近因工作加班晚睡，本週先觀察。";
  const createdAtIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: created, error: createError } = await supabase
    .from("coaching_coach_actions")
    .insert({
      enrollment_id: enrollment.id,
      customer_id: enrollment.customer_id,
      owner_member_id: enrollment.owner_member_id,
      action_type: "acknowledged",
      status: "acknowledged",
      note,
      related_reason_codes: ["recurring_late_sleep"],
      evidence_refs: [],
      is_material: inferCoachActionMaterial({ actionType: "acknowledged", note }),
      created_at: createdAtIso,
      updated_at: createdAtIso,
    })
    .select("*")
    .single();
  if (createError || !created) {
    out.ok = false;
    out.error = createError?.message ?? "create_failed";
    return out;
  }
  const action = mapRow(created as Record<string, unknown>);
  out.create = { ok: true, actionIdPrefix: action.id.slice(0, 8), isMaterial: action.isMaterial };

  const { data: readRow, error: readError } = await supabase
    .from("coaching_coach_actions")
    .select("*")
    .eq("id", action.id)
    .eq("owner_member_id", enrollment.owner_member_id)
    .maybeSingle();
  out.read = { ok: !readError && !!readRow, noteHasOvertime: String(readRow?.note ?? "").includes("加班") };

  const { data: updated, error: updateError } = await supabase
    .from("coaching_coach_actions")
    .update({ status: "follow_up", updated_at: new Date().toISOString() })
    .eq("id", action.id)
    .eq("owner_member_id", enrollment.owner_member_id)
    .select("status")
    .maybeSingle();
  out.update = { ok: !updateError && updated?.status === "follow_up", status: updated?.status ?? null };

  const timelineEvents = buildCoachActionTimelineEvents({
    enrollmentId: String(enrollment.id),
    enrollmentStartedAt: String(enrollment.started_at ?? "2026-07-01T00:00:00.000Z"),
    actions: [mapRow({ ...(created as object), status: "follow_up" } as Record<string, unknown>)],
  });
  const filtered = filterTimelineEvents(timelineEvents as never[], "coach_action");
  out.timeline = {
    ok: timelineEvents.length === 1 && filtered.length === 1,
    title: timelineEvents[0]?.title ?? null,
    filterCount: filtered.length,
  };

  const { decisionContext, generationInput } = buildScenarioDecisionContext("C_watch_pattern");
  // asOf must be >= action.createdAt for 48h acknowledgement matching.
  const asOfIso = new Date().toISOString();
  const asOfLogDate = asOfIso.slice(0, 10);
  const baseAssessInput = {
    asOfLogDate,
    asOfHourTaipei: 15,
    asOfIso,
    daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
    finalInterventionLevel: decisionContext.finalInterventionLevel,
    coachAttention: decisionContext.coachAttention,
    signals: decisionContext.signals,
    outcomeAssessment: decisionContext.outcomeAssessment,
    rollingMemory: {
      ...generationInput.rollingMemory,
      aggregates: {
        ...generationInput.rollingMemory.aggregates,
        lateSleepDays: Math.max(4, generationInput.rollingMemory.aggregates.lateSleepDays),
      },
    },
    submissionCalendar: denseSubmittedCalendar(asOfLogDate, 14),
  };
  const before = assessCoachAttention(baseAssessInput);
  const after = assessCoachAttention({
    ...baseAssessInput,
    recentCoachActions: [mapCoachActionToAttentionShape(action)],
  });
  const escalated = assessCoachAttention({
    ...baseAssessInput,
    finalInterventionLevel: "coach_attention",
    coachAttention: { required: true, reason: "escalated", evidence: [{ key: "tier", value: "coach_attention" }] },
    recentCoachActions: [mapCoachActionToAttentionShape(action)],
  });
  out.attention = {
    beforeRecommendation: before.recommendedActionType,
    afterRecommendation: after.recommendedActionType,
    afterTier: after.tier,
    afterHasLateSleep: after.reasonCodes.includes("recurring_late_sleep"),
    suppressed: after.recommendedActionType === "continue_observe_known_context",
    acknowledged: after.recentCoachActionAcknowledged,
    escalationNotBlocked:
      escalated.tier === "coach_attention" &&
      escalated.recommendedActionType !== "continue_observe_known_context",
  };

  const { data: mismatch } = await supabase
    .from("coaching_coach_actions")
    .select("id")
    .eq("id", action.id)
    .eq("owner_member_id", "00000000-0000-4000-8000-000000000099")
    .maybeSingle();
  out.ownerMismatch = { ok: mismatch == null };

  let customerIsolation: Record<string, unknown> = { skipped: true };
  if (available("NEXT_PUBLIC_SUPABASE_ANON_KEY") === "available") {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: anonRows, error: anonError } = await anon
      .from("coaching_coach_actions")
      .select("id")
      .eq("id", action.id);
    customerIsolation = {
      skipped: false,
      ok: (anonRows?.length ?? 0) === 0,
      rowCount: anonRows?.length ?? 0,
      code: anonError?.code ?? null,
    };
  }
  out.customerIsolation = customerIsolation;

  await supabase
    .from("coaching_coach_actions")
    .update({
      status: "superseded",
      note: `${note} [superseded by phase3d preview gate]`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", action.id);

  out.ok = Boolean(
    (out.create as { ok?: boolean }).ok &&
      (out.read as { ok?: boolean }).ok &&
      (out.update as { ok?: boolean }).ok &&
      (out.timeline as { ok?: boolean }).ok &&
      (out.attention as { suppressed?: boolean }).suppressed &&
      (out.attention as { afterHasLateSleep?: boolean }).afterHasLateSleep &&
      (out.attention as { escalationNotBlocked?: boolean }).escalationNotBlocked &&
      (out.ownerMismatch as { ok?: boolean }).ok &&
      (customerIsolation.skipped || customerIsolation.ok),
  );
  return out;
}

function memoryAction(note: string): CoachingCoachActionRecord {
  return {
    id: "ai-ca-action",
    enrollmentId: "fixture-enroll",
    customerId: "fixture-cust",
    ownerMemberId: "fixture-member",
    actionType: "acknowledged",
    status: "acknowledged",
    note,
    relatedReasonCodes: ["recurring_late_sleep"],
    evidenceRefs: [],
    relatedLogDate: "2026-08-11",
    relatedMeasurementId: null,
    isMaterial: inferCoachActionMaterial({ actionType: "acknowledged", note }),
    supersededBy: null,
    createdAt: "2026-08-11T10:00:00.000+08:00",
    resolvedAt: null,
    updatedAt: "2026-08-11T10:00:00.000+08:00",
  };
}

function judgeAiCa2(input: {
  text: string;
  distinctiveFragments: string[];
}): { verdict: "PASS" | "FAIL"; reason: string } {
  const asksWhy =
    /為什麼晚睡|詢問.*晚睡原因|問他.*為什麼晚睡|了解看看是什麼原因|什麼原因.*晚睡/.test(input.text);
  const unsupportedExpansion = /荷爾蒙|代謝下降|工作壓力造成/.test(input.text);
  const usesKnown = input.distinctiveFragments.some((fragment) => input.text.includes(fragment));
  if (usesKnown && !asksWhy && !unsupportedExpansion) {
    return { verdict: "PASS", reason: "Carries relevant known Coach context without rediscovery or unsupported expansion." };
  }
  if (!usesKnown) {
    return { verdict: "FAIL", reason: "Missing relevant known Coach context fragments in final wording." };
  }
  if (unsupportedExpansion) {
    return { verdict: "FAIL", reason: "Unsupported causal expansion beyond known Coach context." };
  }
  return { verdict: "FAIL", reason: "Still asks late-sleep reason despite known context." };
}

async function runOneAiCa(input: {
  id: "AI-CA1" | "AI-CA2" | "AI-CA3" | "AI-CA4";
  fixture: "C_watch_pattern" | "K_weight_down_muscle_loss";
  note: string | null;
  escalate?: boolean;
}) {
  const apiKey = process.env.OPENAI_API_KEY!.trim();
  const fixture = buildCoachingAiFixtureGenerationInput(input.fixture);
  const recentCoachActionMemory = input.note
    ? buildRecentCoachActionMemory([memoryAction(input.note)])
    : null;
  const generationInput = {
    ...fixture.generationInput,
    recentCoachActionMemory,
  };

  const preparedMealImages = await loadPreparedCoachingEvalMealImages(input.fixture);
  const observed = await observeCoachingMeals({ apiKey, generationInput, preparedMealImages });
  const decisionContext = buildCoachingDecisionContext({
    generationInput,
    mealObservations: observed.observations,
    customerVoice: extractCustomerVoiceSignals(generationInput.todayContext.customerNote),
    finalInterventionLevelOverride: input.escalate ? "watch" : fixture.finalInterventionLevel,
  });

  const attention = assessCoachAttention({
    asOfLogDate: generationInput.logDate,
    asOfHourTaipei: 15,
    asOfIso: `${generationInput.logDate}T18:00:00.000+08:00`,
    daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
    finalInterventionLevel: decisionContext.finalInterventionLevel,
    coachAttention: decisionContext.coachAttention,
    signals: decisionContext.signals,
    outcomeAssessment: decisionContext.outcomeAssessment,
    rollingMemory: {
      ...generationInput.rollingMemory,
      aggregates: {
        ...generationInput.rollingMemory.aggregates,
        lateSleepDays: Math.max(4, generationInput.rollingMemory.aggregates.lateSleepDays ?? 0),
      },
    },
    submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
    recentCoachActions: recentCoachActionMemory
      ? recentCoachActionMemory.recentActions.map((item) => ({
          id: item.id,
          actionType: item.actionType,
          relatedReasonCodes: item.relatedReasonCodes as never[],
          note: item.note,
          createdAt: item.createdAt,
          resolvedAt: item.resolvedAt,
        }))
      : [],
  });

  const provider = new OpenAiCoachingAiProvider(apiKey);
  const result = await provider.generateDailyCoach({
    generationInput,
    finalInterventionLevel: decisionContext.finalInterventionLevel,
    decisionContext,
    preparedMealImages,
  });
  const rawOutput = parseDailyCoachProviderJson(result.rawJson) as CoachingDailyGenerationOutputJson;
  const applied = applyCoachingDecisionContextToOutput(rawOutput, decisionContext, {
    generationInput,
  });

  const quality = evaluateCoachingAiOutputQuality({
    output: applied,
    finalInterventionLevel: decisionContext.finalInterventionLevel,
    generationInput,
    mealObservations: decisionContext.mealObservations,
    decisionContext,
  });

  const allText = [
    applied.coach.daily_summary,
    applied.coach.attention_reason ?? "",
    ...(applied.coach.evidence ?? []),
    applied.customer.today_feedback,
    applied.customer.tomorrow_focus,
    applied.customer.follow_up_for_tomorrow ?? "",
    ...applied.customer.adjustment_priorities,
  ].join("\n");

  let verdict: "PASS" | "WARN" | "FAIL" = "PASS";
  let reason = "ok";

  if (input.id === "AI-CA1") {
    const mayAsk = /晚睡|入睡|作息/.test(allText);
    verdict = mayAsk ? "PASS" : "WARN";
    reason = mayAsk ? "May discuss late sleep without prior coach memory." : "No late-sleep discussion surfaced.";
  } else if (input.id === "AI-CA2") {
    const relevant = buildRelevantCoachActionContext({
      memory: generationInput.recentCoachActionMemory,
      decisionContext,
      asOfIso: relevantCoachActionContextAsOfIso(generationInput.logDate),
    });
    const human = judgeAiCa2({
      text: allText,
      distinctiveFragments: relevant.knownContexts.flatMap((item) => item.distinctiveFragments),
    });
    verdict = human.verdict;
    reason = human.reason;
  } else if (input.id === "AI-CA3") {
    const follows = /睡|作息|加班/.test(allText);
    const redundant = /為什麼晚睡|詢問.*晚睡原因/.test(allText);
    if (follows && !redundant) {
      verdict = "PASS";
      reason = "Acknowledgement-aware follow-up without ignoring condition.";
    } else if (!follows) {
      verdict = "FAIL";
      reason = "Ignored persisting late-sleep condition.";
    } else {
      verdict = "FAIL";
      reason = "Re-asked late-sleep reason despite known context.";
    }
  } else {
    const authorityOk =
      [...quality.customer, ...quality.coach].find((item) => item.id === "coach_action_not_outcome_authority")
        ?.status === "pass";
    verdict =
      authorityOk && decisionContext.outcomeAssessment.outcomeStatus !== "improving" ? "PASS" : "FAIL";
    reason = authorityOk
      ? `Deterministic outcome remains ${decisionContext.outcomeAssessment.outcomeStatus}.`
      : "Coach note may have polluted outcome authority.";
  }

  return {
    id: input.id,
    verdict,
    reason,
    attention: {
      tier: attention.tier,
      recommendedActionType: attention.recommendedActionType,
      reasonCodes: attention.reasonCodes,
      recentCoachActionAcknowledged: attention.recentCoachActionAcknowledged,
    },
    recentCoachActionMemory: recentCoachActionMemory
      ? {
          recentCount: recentCoachActionMemory.recentActions.length,
          materialNotes: recentCoachActionMemory.materialActions.map((item) => item.note),
        }
      : null,
    decisionContext: {
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      outcomeStatus: decisionContext.outcomeAssessment.outcomeStatus,
      measurementStage: decisionContext.goalContext.measurementStage,
      customerSummary: decisionContext.outcomeAssessment.customerSummary,
    },
    qualityOverall: quality.overall,
    rawCustomer: {
      today_feedback: rawOutput.customer.today_feedback,
      tomorrow_focus: rawOutput.customer.tomorrow_focus,
      adjustment_priorities: rawOutput.customer.adjustment_priorities,
    },
    appliedCustomer: {
      today_feedback: applied.customer.today_feedback,
      tomorrow_focus: applied.customer.tomorrow_focus,
      adjustment_priorities: applied.customer.adjustment_priorities,
    },
    rawCoach: {
      daily_summary: rawOutput.coach.daily_summary,
      attention_reason: rawOutput.coach.attention_reason,
    },
    appliedCoach: {
      daily_summary: applied.coach.daily_summary,
      attention_reason: applied.coach.attention_reason,
    },
  };
}

async function runAiCa() {
  if (available("OPENAI_API_KEY") === "unavailable") {
    return { ok: false, error: "missing_openai_api_key", scenarios: [] as unknown[] };
  }

  const scenarios = [
    await runOneAiCa({ id: "AI-CA1", fixture: "C_watch_pattern", note: null }),
    await runOneAiCa({
      id: "AI-CA2",
      fixture: "C_watch_pattern",
      note: "最近因工作加班晚睡。",
    }),
    await runOneAiCa({
      id: "AI-CA3",
      fixture: "C_watch_pattern",
      note: "已詢問，Customer 最近因工作加班晚睡。",
      escalate: true,
    }),
    await runOneAiCa({
      id: "AI-CA4",
      fixture: "K_weight_down_muscle_loss",
      note: "我覺得他最近很好，身體結果看起來很棒。",
    }),
  ];

  return {
    ok: scenarios.every((item) => item.verdict !== "FAIL"),
    scenarios,
  };
}

async function main() {
  console.log("PHASE3D_GATE_START");
  console.log(
    `PHASE3D_GATE_ENV:${JSON.stringify({
      VERCEL_ENV: process.env.VERCEL_ENV ?? null,
      OPENAI_API_KEY: available("OPENAI_API_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: available("SUPABASE_SERVICE_ROLE_KEY"),
      NEXT_PUBLIC_SUPABASE_URL: available("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: available("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      COACHING_AI_EVAL_SECRET: available("COACHING_AI_EVAL_SECRET"),
    })}`,
  );

  const dbSmoke = await runDbSmoke();
  console.log(`PHASE3D_DB_SMOKE:${JSON.stringify(dbSmoke)}`);
  printChunked("PHASE3D_DB_SMOKE_FULL", dbSmoke);

  const aiCa = await runAiCa();
  console.log(
    `PHASE3D_AICA_SUMMARY:${JSON.stringify({
      ok: aiCa.ok,
      scenarios: aiCa.scenarios.map((item) => ({
        id: (item as { id: string }).id,
        verdict: (item as { verdict: string }).verdict,
        reason: (item as { reason: string }).reason,
      })),
    })}`,
  );
  printChunked("PHASE3D_AICA_FULL", aiCa);

  const ok = Boolean(dbSmoke.ok) && Boolean(aiCa.ok);
  console.log(`PHASE3D_GATE_SUMMARY:${JSON.stringify({ ok })}`);
  console.log("PHASE3D_GATE_END");
  // Do not fail the Vercel build: Preview URL + logs are required for the gate report.
  // Verdict is carried only in PHASE3D_GATE_SUMMARY / chunked payloads.
}


main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
