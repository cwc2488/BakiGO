/**
 * Repair orphan stale pending coaching AI outputs (P0-F).
 * Usage:
 *   npx tsx scripts/repair-stale-coaching-ai-pending.ts --enrollmentId=... --logDate=2026-08-13
 *   npx tsx scripts/repair-stale-coaching-ai-pending.ts --jobId=0c784b85-c511-4346-9516-af2318946bf0
 *
 * Never deletes rows. Requeues when pending has no active job, then optionally kicks worker.
 */
import { createClient } from "@supabase/supabase-js";
import { recoverStalePendingCoachingAiOutput } from "../src/lib/coaching/ai/recover-stale-coaching-ai-output";
import { runCoachingGenerationWorkerBatch } from "../src/lib/coaching/ai/run-coaching-generation-worker";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.includes("[SENSITIVE]")) {
    throw new Error(`missing_env:${name}`);
  }
  return value;
}

async function main() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let enrollmentId = arg("enrollmentId");
  let logDate = arg("logDate") ?? "2026-08-13";
  const jobId = arg("jobId") ?? "0c784b85-c511-4346-9516-af2318946bf0";
  const kick = arg("kick") !== "false";

  if (!enrollmentId) {
    const { data: job, error } = await supabase
      .from("coaching_generation_jobs")
      .select("id, status, enrollment_id, log_date, last_error, attempt_count, locked_at, updated_at")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    console.log("job_row", job);
    enrollmentId = job?.enrollment_id ? String(job.enrollment_id) : null;
    if (job?.log_date) logDate = String(job.log_date).slice(0, 10);
  }

  if (!enrollmentId) {
    throw new Error("enrollmentId_required");
  }

  const { data: enrollment, error: enrollError } = await supabase
    .from("coaching_enrollments")
    .select("id, customer_id, owner_member_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (enrollError || !enrollment) {
    throw new Error(enrollError?.message ?? "enrollment_missing");
  }

  const { data: output } = await supabase
    .from("coaching_ai_outputs")
    .select("id, status, error_message, updated_at, started_at, completed_at")
    .eq("enrollment_id", enrollmentId)
    .eq("log_date", logDate)
    .maybeSingle();
  console.log("output_before", output);

  const recovery = await recoverStalePendingCoachingAiOutput({
    enrollmentId,
    ownerMemberId: String(enrollment.owner_member_id),
    customerId: String(enrollment.customer_id),
    logDate,
    nowMs: Date.now(),
    staleAfterMs: 0, // force eligible for explicit repair
  });
  console.log("recovery", recovery);

  let worker = null;
  if (kick) {
    worker = await runCoachingGenerationWorkerBatch({ limit: 2, concurrency: 1 });
    console.log("worker", {
      claimed: worker.claimed,
      completed: worker.completed,
      failed: worker.failed,
      skipped: worker.skipped,
      jobIds: worker.jobIds,
      durationMs: worker.durationMs,
    });
  }

  const { data: outputAfter } = await supabase
    .from("coaching_ai_outputs")
    .select("id, status, error_message, updated_at, started_at, completed_at")
    .eq("enrollment_id", enrollmentId)
    .eq("log_date", logDate)
    .maybeSingle();
  console.log("output_after", outputAfter);
}

main().catch((error) => {
  console.error("repair_failed", error instanceof Error ? error.message : error);
  process.exit(1);
});
