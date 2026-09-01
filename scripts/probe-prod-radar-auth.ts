/**
 * Probe Production Radar cron auth without printing secrets.
 * Usage: npx tsx scripts/probe-prod-radar-auth.ts
 */
import {
  buildRadarCronAuthorizationHeader,
  loadProductionEnvFile,
  readRadarCronClientSecret,
  resolveRadarCronAuthReport,
} from "./radar-prod-auth";

const ORIGIN = (process.env.PRODUCTION_ORIGIN ?? "https://bakigo.tw").replace(/\/$/, "");
const PROD_PROJECT = "ubdrkrvyyrqdvlehzhsz";

async function main() {
  const fileLoad = loadProductionEnvFile(".env.production.local");
  const report = resolveRadarCronAuthReport();
  const secret = readRadarCronClientSecret();

  const out: Record<string, unknown> = {
    origin: ORIGIN,
    expected_server_env: "RADAR_CRON_SECRET",
    expected_header: "Authorization: Bearer <RADAR_CRON_SECRET>",
    vercel_cron_note:
      "Vercel Cron auto-sends CRON_SECRET; Production must also set RADAR_CRON_SECRET to the same value.",
    file_load: fileLoad,
    client: report,
  };

  if (!secret) {
    out.http = { status: null, auth_failure_class: "missing_client_secret" };
    out.fix =
      "Configure RADAR_CRON_SECRET in Cloud Agent secrets or run via: npx vercel env run -e production -- npx tsx scripts/exec-prod-radar-rank-rebuild-0901.ts";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const dry = await fetch(`${ORIGIN}/api/radar/jobs/member-rank-rebuild-batch`, {
    method: "POST",
    headers: buildRadarCronAuthorizationHeader(secret),
    body: JSON.stringify({ dry_run: true }),
    cache: "no-store",
  });
  const body = await dry.json().catch(() => ({}));

  out.http = {
    status: dry.status,
    auth_failure_class:
      dry.status === 401
        ? "unauthorized_bearer_mismatch_or_server_secret_missing"
        : dry.status === 503 && (body as { error?: string }).error === "wrong_supabase_project"
          ? "server_wrong_supabase_project"
          : dry.status === 503
            ? "server_supabase_not_configured"
            : dry.ok
              ? "ok"
              : "other",
    dry_run_ok: (body as { ok?: boolean }).ok ?? false,
    supabase_project: (body as { supabase_project?: string }).supabase_project ?? null,
  };

  if (dry.status === 401) {
    out.fix =
      "Bearer rejected. Verify Vercel Production env var RADAR_CRON_SECRET matches the client secret exactly. CRON_SECRET alone is not read by isRadarCronAuthorized.";
  }

  if (report.supabase_project_hint && report.supabase_project_hint !== PROD_PROJECT) {
    out.warning = `Client Supabase URL points to ${report.supabase_project_hint}, expected ${PROD_PROJECT}`;
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(dry.status === 401 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
