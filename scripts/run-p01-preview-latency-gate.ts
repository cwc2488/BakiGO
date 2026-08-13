/**
 * P0.1 Preview build gate — creates a short-lived portal token.
 * Invoke manually or via temporary build hook. Never prints service secrets.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

type EnrollmentRow = {
  id: string;
  customer_id: string;
  owner_member_id: string;
  status: string;
};

function log(obj: Record<string, unknown>) {
  console.log(`P01_GATE:${JSON.stringify(obj)}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.includes("SENSITIVE")) {
    log({ ok: false, error: "missing_supabase_env" });
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const preferred = [
    "1e507a4d-69f2-419a-838e-bc99fac7f178",
    "56ccb927-ebc0-45ea-badc-18f38d462c7a",
  ];

  let enrollment: EnrollmentRow | null = null;
  for (const id of preferred) {
    const { data } = await supabase
      .from("coaching_enrollments")
      .select("id, customer_id, owner_member_id, status")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      enrollment = data as EnrollmentRow;
      break;
    }
  }
  if (!enrollment) {
    const { data } = await supabase
      .from("coaching_enrollments")
      .select("id, customer_id, owner_member_id, status")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    enrollment = (data as EnrollmentRow | null) ?? null;
  }
  if (!enrollment) {
    log({ ok: false, error: "no_enrollment" });
    return;
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  const { error: tokenErr } = await supabase.from("customer_portal_tokens").upsert(
    {
      token,
      customer_id: enrollment.customer_id,
      expires_at: expiresAt,
    },
    { onConflict: "customer_id" },
  );
  if (tokenErr) {
    log({ ok: false, error: tokenErr.message, enrollmentId: enrollment.id });
    return;
  }

  log({
    ok: true,
    enrollmentId: enrollment.id,
    token,
    tokenLen: token.length,
    expiresAt,
  });
}

main().catch((error) => {
  log({ ok: false, error: error instanceof Error ? error.message : String(error) });
});
