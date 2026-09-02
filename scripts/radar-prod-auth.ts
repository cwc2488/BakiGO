/**
 * Client-side auth/env resolution for Production Radar cron HTTP calls.
 * Must mirror server `isRadarCronAuthorized` (RADAR_CRON_SECRET only).
 * Never logs secret values.
 */
import { existsSync, readFileSync } from "node:fs";

export type RadarCronAuthReport = {
  client_secret_env: "RADAR_CRON_SECRET";
  client_secret_configured: boolean;
  client_secret_length: number;
  supabase_url_configured: boolean;
  supabase_service_role_configured: boolean;
  supabase_project_hint: string | null;
  env_source: "process" | "production_file" | "none";
};

const PLACEHOLDER =
  /^\[SENSITIVE\]|^\[Sensitive\]|^$|^.{0,7}$/;

export function isUsableSecret(value: string | undefined | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (PLACEHOLDER.test(trimmed)) return false;
  return trimmed.length >= 8;
}

export function readRadarCronClientSecret(): string | null {
  const secret = process.env.RADAR_CRON_SECRET?.trim() ?? "";
  return isUsableSecret(secret) ? secret : null;
}

export function buildRadarCronAuthorizationHeader(secret: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

export function resolveRadarCronAuthReport(): RadarCronAuthReport {
  const secret = readRadarCronClientSecret();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  let projectHint: string | null = null;
  if (url.includes("supabase.co")) {
    try {
      projectHint = new URL(url).hostname.split(".")[0] ?? null;
    } catch {
      projectHint = null;
    }
  }

  return {
    client_secret_env: "RADAR_CRON_SECRET",
    client_secret_configured: Boolean(secret),
    client_secret_length: secret?.length ?? 0,
    supabase_url_configured: isUsableSecret(url),
    supabase_service_role_configured: isUsableSecret(serviceKey),
    supabase_project_hint: projectHint,
    env_source: secret ? "process" : "none",
  };
}

export function loadProductionEnvFile(path: string): {
  loaded: string[];
  skipped: string[];
} {
  const loaded: string[] = [];
  const skipped: string[] = [];
  try {
    if (!existsSync(path)) return { loaded, skipped };
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      const productionKeys = new Set([
        "RADAR_CRON_SECRET",
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]);
      if (!productionKeys.has(key)) continue;
      if (!isUsableSecret(value)) {
        skipped.push(`${key}:placeholder_or_short`);
        continue;
      }
      if (process.env[key]?.trim()) {
        skipped.push(`${key}:already_in_process_env`);
        continue;
      }
      process.env[key] = value;
      loaded.push(key);
    }
  } catch {
    skipped.push(`${path}:read_failed`);
  }
  return { loaded, skipped };
}
