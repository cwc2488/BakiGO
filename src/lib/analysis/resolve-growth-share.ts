import { hashGrowthShareToken, isPlausibleGrowthShareToken } from "@/lib/coaching/referral-share/share-token";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

/**
 * Validate opaque /r growth share token server-side.
 * Returns share id only when status=active and not expired.
 * Never accepts client-supplied share UUIDs.
 */
export async function resolveValidatedGrowthShareId(token: string | null | undefined): Promise<string | null> {
  if (!token || !isPlausibleGrowthShareToken(token)) return null;
  if (!isSupabaseServiceConfigured()) return null;
  const supabase = createSupabaseServiceClient();
  const tokenHash = hashGrowthShareToken(token);
  const { data, error } = await supabase
    .from("growth_shares")
    .select("id, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data?.id) return null;
  if (data.status !== "active") return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
  return String(data.id);
}
