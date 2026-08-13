/**
 * Safe stale pending fixture for P0.1 live recovery test.
 */
import { createClient } from "@supabase/supabase-js";

function log(obj: Record<string, unknown>) {
  console.log(`P01_STALE:${JSON.stringify(obj)}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.includes("SENSITIVE")) {
    log({ ok: false, error: "missing_env" });
    return;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const enrollmentId = "1e507a4d-69f2-419a-838e-bc99fac7f178";
  const logDate = "2026-08-11";
  const pointKey = "daily_coach_generation";

  const { data: enr } = await supabase
    .from("coaching_enrollments")
    .select("id, customer_id, owner_member_id")
    .eq("id", enrollmentId)
    .single();
  if (!enr) {
    log({ ok: false, error: "enrollment_missing" });
    return;
  }

  const { data: daily, error: dailyErr } = await supabase
    .from("coaching_daily_logs")
    .upsert(
      {
        enrollment_id: enr.id,
        customer_id: enr.customer_id,
        owner_member_id: enr.owner_member_id,
        log_date: logDate,
        water_ml: 1500,
        exercise_note: "p01 stale fixture",
        bowel_movement_count: 1,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id,log_date" },
    )
    .select("id")
    .single();
  if (dailyErr || !daily) {
    log({ ok: false, error: dailyErr?.message ?? "daily_upsert_failed" });
    return;
  }

  const fingerprint = `p01-stale-orphan-${Date.now()}`;
  const staleUpdatedAt = new Date(Date.now() - 25 * 60 * 1000).toISOString();
  const { data: output, error: outErr } = await supabase
    .from("coaching_ai_outputs")
    .upsert(
      {
        enrollment_id: enr.id,
        customer_id: enr.customer_id,
        owner_member_id: enr.owner_member_id,
        log_date: logDate,
        point_key: pointKey,
        status: "pending",
        input_fingerprint: fingerprint,
        error_message: null,
        updated_at: staleUpdatedAt,
        started_at: null,
        completed_at: null,
        output_json: null,
      },
      { onConflict: "enrollment_id,log_date,point_key" },
    )
    .select("id, status, updated_at")
    .single();
  if (outErr || !output) {
    log({ ok: false, error: outErr?.message ?? "output_upsert_failed" });
    return;
  }

  await supabase
    .from("coaching_generation_jobs")
    .update({
      status: "failed",
      last_error: "p01_stale_orphan_fixture",
      updated_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq("output_id", output.id)
    .in("status", ["queued", "running", "processing", "claimed"]);

  log({
    ok: true,
    enrollmentId: enr.id,
    logDate,
    dailyId: daily.id,
    outputId: output.id,
    fingerprint,
    staleUpdatedAt,
  });
}

main().catch((e) => log({ ok: false, error: String(e) }));
