import { createHash } from "node:crypto";
import {
  ANALYSIS_AI_MAX_ATTEMPTS,
  ANALYSIS_AI_PROMPT_VERSION,
  type AnalysisAiInputSnapshot,
  type AnalysisAiReport,
} from "@/lib/analysis/analysis-ai-schema";
import type { QuizPrior } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";
import { generateInsightPreviewLayer2 } from "@/lib/analysis/insight-preview-bridge";
import { classifyAnalysisAiError, generateAnalysisAiReport } from "@/lib/analysis/analysis-ai-provider";
import type { AnalysisLayer1Report } from "@/lib/analysis/build-analysis-layer1";
import type { AnalysisIntakeAnswers } from "@/lib/analysis/analysis-questions";
import { getPersonalityProfile } from "@/lib/quiz/fat-loss/personality-content";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new Error("Supabase service role is not configured.");
  }
  return createSupabaseServiceClient();
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function logAnalysisJobLifecycle(event: {
  stage: string;
  job_id?: string | null;
  report_id?: string | null;
  session_id?: string | null;
  duration_ms?: number | null;
  error_class?: string | null;
  reason?: string | null;
}): void {
  console.info(
    JSON.stringify({
      type: "analysis_ai_job_lifecycle",
      timestamp: new Date().toISOString(),
      ...event,
    }),
  );
}

export async function enqueueAnalysisAiGeneration(input: {
  sessionId: string;
  quizResultId: string;
  answers: AnalysisIntakeAnswers;
  layer1: AnalysisLayer1Report;
  quiz: {
    primaryType: PersonalityType;
    primaryGoal: string | null;
    readiness: string | null;
    actionHistoryLabels: string[];
    nativeSeed?: boolean;
  };
  dynamicContext?: AnalysisAiInputSnapshot["dynamicContext"];
}): Promise<{ reportId: string; jobId: string | null; skipped: boolean }> {
  const supabase = requireService();
  const profile = input.quiz.nativeSeed
    ? {
        animalName: input.layer1.facts.animalName || "",
        tagline: "",
        coreInsight: "",
      }
    : getPersonalityProfile(input.quiz.primaryType);
  const snapshot: AnalysisAiInputSnapshot = {
    version: ANALYSIS_AI_PROMPT_VERSION,
    quiz: {
      primaryType: input.quiz.primaryType,
      animalName: profile.animalName,
      tagline: profile.tagline,
      coreInsight: profile.coreInsight,
      primaryGoal: input.quiz.primaryGoal,
      readiness: input.quiz.readiness,
      actionHistoryLabels: input.quiz.actionHistoryLabels,
    },
    answers: input.answers as unknown as Record<string, unknown>,
    layer1: input.layer1 as unknown as Record<string, unknown>,
    safetyFlagged: input.answers.safety_gate === "yes",
    dynamicContext: input.dynamicContext,
  };
  const inputFingerprint = fingerprint(snapshot);

  // Idempotent: reuse existing report for same session+fingerprint if active/completed.
  const { data: existing } = await supabase
    .from("analysis_reports")
    .select("id, status, input_fingerprint")
    .eq("analysis_session_id", input.sessionId)
    .maybeSingle();

  if (existing?.id && existing.input_fingerprint === inputFingerprint) {
    if (existing.status === "completed") {
      await supabase
        .from("analysis_sessions")
        .update({ analysis_state: "ai_ready", report_id: existing.id })
        .eq("id", input.sessionId);
      logAnalysisJobLifecycle({
        stage: "job_enqueue_skipped",
        report_id: existing.id,
        session_id: input.sessionId,
        reason: "already_completed",
      });
      return { reportId: existing.id, jobId: null, skipped: true };
    }
    const { data: activeJob } = await supabase
      .from("analysis_generation_jobs")
      .select("id, status")
      .eq("report_id", existing.id)
      .eq("input_fingerprint", inputFingerprint)
      .in("status", ["queued", "processing"])
      .maybeSingle();
    if (activeJob?.id) {
      await supabase
        .from("analysis_sessions")
        .update({ analysis_state: "ai_generating", report_id: existing.id })
        .eq("id", input.sessionId);
      logAnalysisJobLifecycle({
        stage: "job_enqueue_skipped",
        job_id: activeJob.id,
        report_id: existing.id,
        session_id: input.sessionId,
        reason: "active_job_exists",
      });
      return { reportId: existing.id, jobId: activeJob.id, skipped: true };
    }
  }

  let reportId = existing?.id ?? null;
  if (!reportId) {
    const { data: inserted, error } = await supabase
      .from("analysis_reports")
      .insert({
        analysis_session_id: input.sessionId,
        quiz_result_id: input.quizResultId,
        input_fingerprint: inputFingerprint,
        input_snapshot: snapshot,
        layer1_json: input.layer1,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      // Unique race: fetch existing
      const { data: raced } = await supabase
        .from("analysis_reports")
        .select("id")
        .eq("analysis_session_id", input.sessionId)
        .maybeSingle();
      if (!raced?.id) throw new Error(error?.message || "Failed to create analysis report");
      reportId = raced.id;
    } else {
      reportId = inserted.id;
    }
  } else {
    await supabase
      .from("analysis_reports")
      .update({
        input_fingerprint: inputFingerprint,
        input_snapshot: snapshot,
        layer1_json: input.layer1,
        status: "pending",
        error_class: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reportId);
  }

  const { data: job, error: jobError } = await supabase
    .from("analysis_generation_jobs")
    .insert({
      analysis_session_id: input.sessionId,
      report_id: reportId,
      input_fingerprint: inputFingerprint,
      status: "queued",
      available_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobError) {
    // Active unique index conflict → treat as skip
    if (/duplicate|unique/i.test(jobError.message)) {
      logAnalysisJobLifecycle({
        stage: "job_enqueue_skipped",
        report_id: reportId,
        session_id: input.sessionId,
        reason: "duplicate_active_job",
      });
      await supabase
        .from("analysis_sessions")
        .update({ analysis_state: "ai_generating", report_id: reportId })
        .eq("id", input.sessionId);
      return { reportId, jobId: null, skipped: true };
    }
    throw new Error(jobError.message);
  }

  await supabase
    .from("analysis_sessions")
    .update({ analysis_state: "ai_generating", report_id: reportId })
    .eq("id", input.sessionId);

  logAnalysisJobLifecycle({
    stage: "job_enqueued",
    job_id: job.id,
    report_id: reportId,
    session_id: input.sessionId,
  });

  return { reportId, jobId: job.id, skipped: false };
}

export async function processAnalysisGenerationJob(job: {
  id: string;
  report_id: string;
  analysis_session_id: string;
  input_fingerprint: string;
  attempt_count: number;
}): Promise<"completed" | "failed" | "retry"> {
  const supabase = requireService();
  const started = Date.now();
  logAnalysisJobLifecycle({
    stage: "job_claimed",
    job_id: job.id,
    report_id: job.report_id,
    session_id: job.analysis_session_id,
  });

  const { data: report, error } = await supabase
    .from("analysis_reports")
    .select("*")
    .eq("id", job.report_id)
    .maybeSingle();
  if (error || !report) {
    await failJob(job, "context_missing", "report_missing");
    return "failed";
  }

  await supabase
    .from("analysis_reports")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", report.id);

  try {
    const snapshot = report.input_snapshot as AnalysisAiInputSnapshot;
    const generated =
      snapshot.dynamicContext?.reportKind === "insight_compressed"
        ? await generateInsightPreviewLayer2({
            quizPrior: (snapshot.dynamicContext.quizPrior?.prior as QuizPrior | null) ?? null,
            reasoning: (snapshot.dynamicContext.insightReasoning ?? null) as Parameters<
              typeof generateInsightPreviewLayer2
            >[0]["reasoning"],
            transcript: (snapshot.dynamicContext.interviewTranscript ?? []).map((t) => ({
              role: t.role,
              text: t.text,
            })),
          })
        : await generateAnalysisAiReport({
            snapshot,
            inputFingerprint: job.input_fingerprint,
          });

    await supabase
      .from("analysis_reports")
      .update({
        status: "completed",
        output_json: generated.report,
        model: generated.model,
        prompt_version: generated.promptVersion,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_class: null,
        error_message: null,
      })
      .eq("id", report.id);

    await supabase
      .from("analysis_generation_jobs")
      .update({
        status: "completed",
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await supabase
      .from("analysis_sessions")
      .update({
        analysis_state: "ai_ready",
        report_id: report.id,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", job.analysis_session_id);

    logAnalysisJobLifecycle({
      stage: "job_completed",
      job_id: job.id,
      report_id: report.id,
      session_id: job.analysis_session_id,
      duration_ms: Date.now() - started,
    });
    return "completed";
  } catch (err) {
    const errorClass = classifyAnalysisAiError(err);
    if (job.attempt_count < ANALYSIS_AI_MAX_ATTEMPTS && errorClass === "timeout") {
      await supabase
        .from("analysis_generation_jobs")
        .update({
          status: "queued",
          available_at: new Date(Date.now() + 2000).toISOString(),
          locked_at: null,
          locked_by: null,
          last_error_class: errorClass,
          last_error: errorClass,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      logAnalysisJobLifecycle({
        stage: "job_retry_scheduled",
        job_id: job.id,
        report_id: report.id,
        session_id: job.analysis_session_id,
        error_class: errorClass,
      });
      return "retry";
    }
    await failJob(job, errorClass, errorClass);
    return "failed";
  }
}

async function failJob(
  job: { id: string; report_id: string; analysis_session_id: string },
  errorClass: string,
  errorMessage: string,
) {
  const supabase = requireService();
  await supabase
    .from("analysis_generation_jobs")
    .update({
      status: "failed",
      locked_at: null,
      locked_by: null,
      last_error_class: errorClass,
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  await supabase
    .from("analysis_reports")
    .update({
      status: "failed",
      error_class: errorClass,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.report_id);
  // Layer1 remains; session → ai_failed
  await supabase
    .from("analysis_sessions")
    .update({
      analysis_state: "ai_failed",
      report_id: job.report_id,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", job.analysis_session_id);
  logAnalysisJobLifecycle({
    stage: "job_failed",
    job_id: job.id,
    report_id: job.report_id,
    session_id: job.analysis_session_id,
    error_class: errorClass,
  });
}

export async function runAnalysisGenerationWorkerBatch(input?: {
  limit?: number;
}): Promise<{ claimed: number; completed: number; failed: number; retried: number }> {
  const supabase = requireService();
  await supabase.rpc("reclaim_stale_analysis_generation_jobs", { p_stale_after_minutes: 3 });
  const { data: claimed, error } = await supabase.rpc("claim_analysis_generation_jobs", {
    p_limit: input?.limit ?? 2,
    p_locked_by: `analysis-worker-${process.pid}`,
  });
  if (error) throw new Error(error.message);
  const jobs = (claimed ?? []) as Array<{
    id: string;
    report_id: string;
    analysis_session_id: string;
    input_fingerprint: string;
    attempt_count: number;
  }>;
  let completed = 0;
  let failed = 0;
  let retried = 0;
  for (const job of jobs) {
    const outcome = await processAnalysisGenerationJob(job);
    if (outcome === "completed") completed += 1;
    else if (outcome === "failed") failed += 1;
    else retried += 1;
  }
  return { claimed: jobs.length, completed, failed, retried };
}

export type { AnalysisAiReport };
