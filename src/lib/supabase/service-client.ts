import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  const { url, serviceRoleKey } = readSupabaseServiceEnv();
  return Boolean(url && serviceRoleKey);
}

export function createSupabaseServiceClient(): SupabaseClient {
  const { url, serviceRoleKey } = readSupabaseServiceEnv();
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role environment is not configured");
  }

  return createClient(url, serviceRoleKey, {
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
