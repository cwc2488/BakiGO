import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ASCII_HEADER_VALUE = /^[\x00-\xFF]*$/;
const LEGACY_JWT_KEY = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const NEW_SECRET_KEY = /^sb_secret_[A-Za-z0-9_-]+$/;

export class SupabaseServiceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseServiceConfigError";
  }
}

function assertAsciiHeaderValue(value: string, name: string): string {
  if (!ASCII_HEADER_VALUE.test(value)) {
    const invalidIndex = [...value].findIndex((char) => char.charCodeAt(0) > 255);
    throw new SupabaseServiceConfigError(
      `${name} contains non-ASCII characters${invalidIndex >= 0 ? ` at index ${invalidIndex}` : ""}. Use the service_role JWT from Supabase Settings > API, not setup instructions.`,
    );
  }
  return value;
}

function assertServiceRoleKey(value: string): string {
  const trimmed = value.trim();
  assertAsciiHeaderValue(trimmed, "SUPABASE_SERVICE_ROLE_KEY");

  if (LEGACY_JWT_KEY.test(trimmed) || NEW_SECRET_KEY.test(trimmed)) {
    return trimmed;
  }

  throw new SupabaseServiceConfigError(
    "SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT or sb_secret key from Supabase Settings > API.",
  );
}

function assertSupabaseUrl(value: string): string {
  const trimmed = value.trim();
  assertAsciiHeaderValue(trimmed, "NEXT_PUBLIC_SUPABASE_URL");

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
    return trimmed;
  } catch {
    throw new SupabaseServiceConfigError("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
}

export function readSupabaseServiceEnv(): {
  url: string;
  serviceRoleKey: string;
} {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}

export function isSupabaseServiceConfigured(): boolean {
  try {
    const { url, serviceRoleKey } = readSupabaseServiceEnv();
    if (!url || !serviceRoleKey) {
      return false;
    }
    assertSupabaseUrl(url);
    assertServiceRoleKey(serviceRoleKey);
    return true;
  } catch {
    return false;
  }
}

export function createSupabaseServiceClient(): SupabaseClient {
  const { url, serviceRoleKey } = readSupabaseServiceEnv();
  if (!url || !serviceRoleKey) {
    throw new SupabaseServiceConfigError("Supabase service role environment is not configured");
  }

  const safeUrl = assertSupabaseUrl(url);
  const safeServiceRoleKey = assertServiceRoleKey(serviceRoleKey);

  return createClient(safeUrl, safeServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function readRadarCronSecret(): string {
  return process.env.RADAR_CRON_SECRET ?? "";
}

export function isRadarCronAuthorized(request: Request): boolean {
  const secret = readRadarCronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice("Bearer ".length) === secret;
}

export function readCoachingCronSecret(): string {
  // Prefer dedicated coaching secret; accept Vercel Cron's CRON_SECRET and radar fallback.
  return (
    process.env.COACHING_CRON_SECRET ??
    process.env.CRON_SECRET ??
    process.env.RADAR_CRON_SECRET ??
    ""
  );
}

export function isCoachingCronAuthorized(request: Request): boolean {
  const secret = readCoachingCronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice("Bearer ".length) === secret;
}
