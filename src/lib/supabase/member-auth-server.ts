import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabaseEnv } from "@/lib/supabase/env";

/**
 * Resolve the signed-in member from the server request cookies.
 * Used by Recognition Center page layouts so direct URL access is denied
 * even when the client nav link is hidden.
 */
export async function getMemberIdFromCookies(): Promise<string | null> {
  const { url, anonKey } = readSupabaseEnv();
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Server layouts are read-only for auth cookies.
      },
    },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;

  const lookup = await client
    .from("members")
    .select("id")
    .eq("email", data.user.email?.toLowerCase() ?? "")
    .maybeSingle();
  if (lookup.error) throw new Error(lookup.error.message);
  return lookup.data?.id ? String(lookup.data.id) : data.user.id;
}
