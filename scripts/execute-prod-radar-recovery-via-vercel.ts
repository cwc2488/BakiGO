/**
 * Production Radar recovery via Vercel Production env (secure RADAR_CRON_SECRET source).
 * Never prints secret values.
 *
 * Usage:
 *   VERCEL_TOKEN=... npx tsx scripts/execute-prod-radar-recovery-via-vercel.ts
 *   # or when RADAR_CRON_SECRET already in process env:
 *   RADAR_CRON_SECRET=... npx tsx scripts/execute-prod-radar-recovery-via-vercel.ts --direct
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  buildRadarCronAuthorizationHeader,
  isUsableSecret,
  readRadarCronClientSecret,
} from "./radar-prod-auth";

const ORIGIN = (process.env.PRODUCTION_ORIGIN ?? "https://bakigo.tw").replace(/\/$/, "");
const PROD_PROJECT = "ubdrkrvyyrqdvlehzhsz";
const SNAPSHOT_DATE = "2026-09-01";
const PIPELINE_RUN_ID = "9e484340-4ccd-4c8c-9271-430705cae699";
const AFFECTED_MEMBER = "f8359859-b5f7-4c97-b0b1-7a5a2ab9fd92";
const OLD_GENERATED_AT = "2026-09-01 03:42:33.938+00";

type Report = Record<string, unknown>;

function redactReport(report: Report): Report {
  return JSON.parse(
    JSON.stringify(report, (_k, v) =>
      typeof v === "string" && v.length >= 20 && /secret|key|bearer/i.test(String(_k))
        ? "[redacted]"
        : v,
    ),
  );
}

async function verifyDb(serviceKey: string, url: string) {
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: memberRow, error: memberErr } = await client
    .from("member_daily_top20")
    .select("generated_at, item_count, items")
    .eq("member_id", AFFECTED_MEMBER)
    .eq("snapshot_date", SNAPSHOT_DATE)
    .maybeSingle();
  if (memberErr) throw new Error(memberErr.message);

  const { data: allRows, error: allErr } = await client
    .from("member_daily_top20")
    .select("member_id, item_count")
    .eq("snapshot_date", SNAPSHOT_DATE);
  if (allErr) throw new Error(allErr.message);

  let empty = 0;
  let nonempty = 0;
  for (const row of allRows ?? []) {
    if (Number(row.item_count ?? 0) === 0) empty += 1;
    else nonempty += 1;
  }

  const newGeneratedAt = memberRow?.generated_at ? String(memberRow.generated_at) : null;
  const changed =
    Boolean(newGeneratedAt) &&
    newGeneratedAt!.localeCompare(OLD_GENERATED_AT) > 0;

  return {
    old_generated_at: OLD_GENERATED_AT,
    new_generated_at: newGeneratedAt,
    generated_at_changed: changed,
    top20_item_count: Number(memberRow?.item_count ?? 0),
    items: memberRow?.items ?? [],
    empty_after: empty,
    nonempty_after: nonempty,
  };
}

async function runHttpRecovery(secret: string): Promise<Report> {
  const headers = buildRadarCronAuthorizationHeader(secret);
  const dry = await fetch(`${ORIGIN}/api/radar/jobs/member-rank-rebuild-batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({ dry_run: true }),
    cache: "no-store",
  });
  const dryJson = await dry.json().catch(() => ({}));
  if (dry.status === 401) {
    return {
      secret_source: process.env.VERCEL_TOKEN ? "vercel_env_run" : "process_env",
      auth_header_sent: true,
      http_status: 401,
      auth_failure: "bearer_rejected",
      dry: dryJson,
    };
  }

  const batch = await fetch(`${ORIGIN}/api/radar/jobs/member-rank-rebuild-batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({ member_limit: 200 }),
    cache: "no-store",
  });
  const batchJson = await batch.json().catch(() => ({}));

  return {
    secret_source: process.env.VERCEL_TOKEN ? "vercel_env_run" : "process_env",
    auth_header_sent: true,
    http_status: batch.status,
    dry: dryJson,
    batch: batchJson,
    rebuilt: (batchJson as { members_rebuilt?: number }).members_rebuilt ?? null,
    failed: (batchJson as { members_failed?: number }).members_failed ?? null,
    snapshots_updated: (batchJson as { snapshots_updated?: number }).snapshots_updated ?? null,
  };
}

async function mainInner() {
  const secret = readRadarCronClientSecret();
  if (!secret) {
    const report: Report = {
      secret_source: "none",
      auth_header_sent: false,
      http_status: null,
      error: "RADAR_CRON_SECRET not available in process environment",
    };
    writeFileSync(".tmp-prod-radar-recovery-report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const http = await runHttpRecovery(secret);
  const report: Report = { ...http };

  if (http.http_status !== 401 && http.http_status !== null) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
    if (isUsableSecret(url) && isUsableSecret(serviceKey) && url.includes(PROD_PROJECT)) {
      try {
        report.db = await verifyDb(serviceKey, url);
        report.production_db_verified = Boolean(
          (report.db as { generated_at_changed?: boolean }).generated_at_changed,
        );
      } catch (error) {
        report.db_error = error instanceof Error ? error.message : String(error);
        report.production_db_verified = false;
      }
    } else {
      report.db_skipped = "supabase_service_env_unavailable_for_verification";
      report.production_db_verified = false;
    }
  } else {
    report.production_db_verified = false;
  }

  writeFileSync(".tmp-prod-radar-recovery-report.json", JSON.stringify(redactReport(report), null, 2));
  console.log(JSON.stringify(redactReport(report), null, 2));

  if (http.http_status === 401 || !report.production_db_verified) {
    process.exit(2);
  }
}

function runViaVercelEnv() {
  const token = process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_ACCESS_TOKEN?.trim() || "";
  if (!token) {
    const report: Report = {
      secret_source: "none",
      auth_header_sent: false,
      http_status: null,
      error: "VERCEL_TOKEN required to pull Production RADAR_CRON_SECRET via vercel env run",
      fix: "Set VERCEL_TOKEN in Cloud Agent secrets, then rerun this script",
    };
    writeFileSync(".tmp-prod-radar-recovery-report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  process.env.VERCEL_TOKEN = token;
  const link = spawnSync(
    "npx",
    ["vercel@latest", "link", "--yes", "--project", "baki-go", "--token", token],
    { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 },
  );
  if (link.status !== 0) {
    const report: Report = {
      secret_source: "vercel_cli",
      auth_header_sent: false,
      http_status: null,
      error: "vercel_link_failed",
      link_status: link.status,
      link_stderr: (link.stderr || link.stdout || "").slice(0, 500),
    };
    writeFileSync(".tmp-prod-radar-recovery-report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const run = spawnSync(
    "npx",
    [
      "vercel@latest",
      "env",
      "run",
      "-e",
      "production",
      "--token",
      token,
      "--",
      "npx",
      "tsx",
      "scripts/execute-prod-radar-recovery-via-vercel.ts",
      "--direct",
    ],
    { cwd: process.cwd(), encoding: "utf8", stdio: "inherit", timeout: 600_000 },
  );
  process.exit(run.status ?? 1);
}

const direct = process.argv.includes("--direct");
if (direct) {
  mainInner().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
} else if (readRadarCronClientSecret()) {
  mainInner().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
} else {
  runViaVercelEnv();
}
