import { noStoreJson } from "@/lib/radar/jobs/auto-drain";
import { loadOneTimeRecovery0901PublicReport } from "@/lib/radar/jobs/one-time-recovery-0901";
import { ONE_TIME_RECOVERY_0901 } from "@/lib/radar/jobs/one-time-recovery-0901-constants";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
  readSupabaseServiceEnv,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only public verification for the one-time 2026-09-01 recovery.
 * No auth — exposes only hardcoded-scope DB facts (no secrets, no mutation).
 */

export async function GET() {
  if (!isSupabaseServiceConfigured()) {
    return noStoreJson({ error: "not_available" }, { status: 503 });
  }

  const { url: supabase_url } = readSupabaseServiceEnv();
  if (!supabase_url.includes(ONE_TIME_RECOVERY_0901.supabase_project)) {
    return noStoreJson({ error: "not_available" }, { status: 503 });
  }

  try {
    const client = createSupabaseServiceClient();
    const report = await loadOneTimeRecovery0901PublicReport(client);
    return noStoreJson(report);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "status_failed";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
