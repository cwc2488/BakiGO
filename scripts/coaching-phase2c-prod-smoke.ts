/**
 * Phase 2c production enable smoke.
 * Usage:
 *   npx vercel env run -e production -- npx tsx scripts/coaching-phase2c-prod-smoke.ts
 * Does not print secrets.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { enqueueDailyCoachGenerationAfterSubmit } from "../src/lib/coaching/ai/enqueue-daily-coach-generation";
import { getCoachingAiOutputForDay } from "../src/lib/coaching/ai/coaching-ai-store";

type SmokeReport = {
  ok: boolean;
  step: string;
  migrations?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  smoke?: Record<string, unknown>;
  cleanup?: Record<string, unknown>;
  env?: Record<string, unknown>;
  error?: string;
  note?: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value === "[SENSITIVE]") {
    throw new Error(`missing_or_placeholder:${name}`);
  }
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const out: SmokeReport = { ok: false, step: "init" };

  try {
    const url = required("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = required("COACHING_CRON_SECRET");
    required("OPENAI_API_KEY");
    const productionOrigin = process.env.PRODUCTION_ORIGIN?.trim() || "https://bakigo.tw";

    // Ensure local service client helpers see the same env.
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

    out.env = {
      hasUrl: true,
      hasServiceKey: true,
      hasCoachingCronSecret: true,
      hasCronSecret: Boolean(process.env.CRON_SECRET?.trim()),
      hasOpenAi: true,
      productionOrigin,
    };

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    out.step = "verify_schema";
    const tables = [
      "coaching_coach_directives",
      "coaching_ai_outputs",
      "coaching_generation_jobs",
      "ai_llm_call_log",
    ] as const;
    const tableChecks: Record<string, boolean> = {};
    for (const table of tables) {
      const { error } = await supabase.from(table).select("*").limit(0);
      tableChecks[table] = !error;
    }
    const { error: reclaimError } = await supabase.rpc("reclaim_stale_coaching_generation_jobs", {
      p_stale_after_minutes: 15,
    });
    const { error: claimError } = await supabase.rpc("claim_coaching_generation_jobs", {
      p_limit: 0,
      p_locked_by: "smoke-verify",
    });
    out.migrations = {
      tables: tableChecks,
      allTablesExist: tables.every((name) => tableChecks[name]),
      reclaimRpc: reclaimError?.code !== "PGRST202",
      claimRpc: claimError?.code !== "PGRST202",
    };
    assert(out.migrations.allTablesExist, "029_tables_missing");
    assert(out.migrations.reclaimRpc && out.migrations.claimRpc, "030_rpcs_missing");

    out.step = "auth_guard";
    const unauth = await fetch(`${productionOrigin}/api/coaching/jobs/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 1 }),
    });
    out.auth = { unauthStatus: unauth.status };
    assert(unauth.status === 401, `expected_401_got_${unauth.status}`);

    out.step = "pick_enrollment";
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("coaching_enrollments")
      .select("id, customer_id, owner_member_id, status")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assert(!enrollmentError, enrollmentError?.message ?? "enrollment_query_failed");
    assert(enrollment, "no_active_enrollment_for_smoke");

    const logDate = "2099-01-02";
    const smokeMarker = `phase2c-smoke-${Date.now()}`;

    out.step = "seed_submitted_daily";
    const { data: dailyLog, error: dailyError } = await supabase
      .from("coaching_daily_logs")
      .upsert(
        {
          enrollment_id: enrollment.id,
          customer_id: enrollment.customer_id,
          owner_member_id: enrollment.owner_member_id,
          log_date: logDate,
          water_ml: 1800,
          sleep_bedtime: "23:10",
          sleep_wake_time: "07:00",
          sleep_duration: "7小時50分",
          bowel_movement_count: 1,
          customer_note: smokeMarker,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "enrollment_id,log_date" },
      )
      .select("id")
      .single();
    assert(!dailyError && dailyLog, dailyError?.message ?? "daily_upsert_failed");

    for (const slot of ["breakfast", "lunch", "dinner"] as const) {
      await supabase.from("coaching_meal_entries").upsert(
        {
          daily_log_id: dailyLog.id,
          meal_slot: slot,
          text_note: slot === "breakfast" ? "白飯＋雞蛋＋青菜" : "均衡餐點",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "daily_log_id,meal_slot" },
      );
    }

    // Cleanup any prior smoke rows for this synthetic date.
    await supabase
      .from("coaching_generation_jobs")
      .delete()
      .eq("enrollment_id", enrollment.id)
      .eq("log_date", logDate);
    await supabase
      .from("coaching_ai_outputs")
      .delete()
      .eq("enrollment_id", enrollment.id)
      .eq("log_date", logDate);

    out.step = "enqueue";
    const enqueueResult = await enqueueDailyCoachGenerationAfterSubmit({
      enrollmentId: enrollment.id,
      ownerMemberId: enrollment.owner_member_id,
      logDate,
    });
    out.smoke = { ...(out.smoke ?? {}), enqueue: enqueueResult };
    assert(enqueueResult.action === "enqueued", `enqueue_skip_${"reason" in enqueueResult ? enqueueResult.reason : ""}`);

    out.step = "worker_process";
    const workerResp = await fetch(`${productionOrigin}/api/coaching/jobs/process`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ limit: 10 }),
    });
    const workerJson = (await workerResp.json().catch(() => ({}))) as Record<string, unknown>;
    out.smoke = {
      ...out.smoke,
      workerStatus: workerResp.status,
      worker: {
        ok: workerJson.ok,
        claimed: workerJson.claimed,
        completed: workerJson.completed,
        failed: workerJson.failed,
        superseded: workerJson.superseded,
        retryScheduled: workerJson.retryScheduled,
      },
    };
    assert(workerResp.status === 200 && workerJson.ok, `worker_http_${workerResp.status}`);

    // Poll output up to ~90s for completion (OpenAI latency).
    out.step = "poll_output";
    let outputStatus = "pending";
    let finalOutput: Awaited<ReturnType<typeof getCoachingAiOutputForDay>> = null;
    for (let i = 0; i < 30; i += 1) {
      finalOutput = await getCoachingAiOutputForDay({
        enrollmentId: enrollment.id,
        logDate,
      });
      outputStatus = finalOutput?.status ?? "missing";
      if (outputStatus === "completed" || outputStatus === "failed") break;

      // Trigger another worker tick in case first claim raced.
      if (i === 5 || i === 15) {
        await fetch(`${productionOrigin}/api/coaching/jobs/process`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${cronSecret}`,
          },
          body: JSON.stringify({ limit: 10 }),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    out.smoke = {
      ...out.smoke,
      outputStatus,
      hasCustomerSlice: Boolean(finalOutput?.outputJson?.customer?.encouragement),
      hasCoachSlice: Boolean(finalOutput?.outputJson?.coach?.daily_summary),
      finalInterventionLevel: finalOutput?.finalInterventionLevel ?? null,
      coachAttentionRequired: finalOutput?.outputJson?.coach?.coach_attention_required ?? null,
    };
    assert(outputStatus === "completed", `output_not_completed_${outputStatus}`);
    assert(finalOutput?.outputJson?.customer, "missing_customer_slice");
    assert(finalOutput?.outputJson?.coach, "missing_coach_slice");

    out.step = "telemetry";
    const { data: telemetryRows, error: telemetryError } = await supabase
      .from("ai_llm_call_log")
      .select("id, feature, point_key, status, model, enrollment_id, input_fingerprint")
      .eq("enrollment_id", enrollment.id)
      .eq("feature", "coaching")
      .eq("input_fingerprint", finalOutput!.inputFingerprint)
      .order("created_at", { ascending: false })
      .limit(5);
    assert(!telemetryError, telemetryError?.message ?? "telemetry_query_failed");
    out.smoke = {
      ...out.smoke,
      telemetryCount: telemetryRows?.length ?? 0,
      telemetryStatuses: (telemetryRows ?? []).map((row) => row.status),
    };
    assert((telemetryRows?.length ?? 0) > 0, "telemetry_missing");

    out.step = "customer_api_shape";
    // Portal token may not exist for this enrollment; validate DB customer slice shape instead.
    const customerSlice = finalOutput!.outputJson!.customer;
    assert(typeof customerSlice.encouragement === "string", "customer_encouragement");
    assert(typeof customerSlice.today_feedback === "string", "customer_today_feedback");
    assert(Array.isArray(customerSlice.adjustment_priorities), "customer_priorities");
    assert(typeof customerSlice.tomorrow_focus === "string", "customer_tomorrow_focus");
    // Ensure coach-only fields are not on customer object.
    assert(!("daily_summary" in customerSlice), "customer_leaked_coach_field");

    out.step = "coach_slice_shape";
    const coachSlice = finalOutput!.outputJson!.coach;
    assert(typeof coachSlice.daily_summary === "string", "coach_daily_summary");
    assert(Array.isArray(coachSlice.evidence), "coach_evidence");
    assert(typeof coachSlice.coach_attention_required === "boolean", "coach_attention");

    out.step = "cleanup";
    const { error: jobDelError } = await supabase
      .from("coaching_generation_jobs")
      .delete()
      .eq("enrollment_id", enrollment.id)
      .eq("log_date", logDate);
    const { error: outputDelError } = await supabase
      .from("coaching_ai_outputs")
      .delete()
      .eq("enrollment_id", enrollment.id)
      .eq("log_date", logDate);
    const { error: mealDelError } = await supabase
      .from("coaching_meal_entries")
      .delete()
      .eq("daily_log_id", dailyLog.id);
    const { error: dailyDelError } = await supabase
      .from("coaching_daily_logs")
      .delete()
      .eq("id", dailyLog.id);
    // Keep telemetry rows? User asked cleanup smoke test data — remove related telemetry for this fingerprint.
    const { error: telemetryDelError } = await supabase
      .from("ai_llm_call_log")
      .delete()
      .eq("enrollment_id", enrollment.id)
      .eq("input_fingerprint", finalOutput!.inputFingerprint);

    out.cleanup = {
      jobs: !jobDelError,
      outputs: !outputDelError,
      meals: !mealDelError,
      daily: !dailyDelError,
      telemetry: !telemetryDelError,
    };
    assert(
      !jobDelError && !outputDelError && !mealDelError && !dailyDelError && !telemetryDelError,
      "cleanup_failed",
    );

    out.ok = true;
    out.step = "done";
    out.note = "Phase 2c production smoke passed";
  } catch (error) {
    out.ok = false;
    out.error = error instanceof Error ? error.message : String(error);
  }

  writeFileSync(".tmp-coaching-phase2c-smoke.json", JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

void main();
