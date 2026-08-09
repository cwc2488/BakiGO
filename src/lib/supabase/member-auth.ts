import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";

export function createSupabaseAnonClient(accessToken?: string): SupabaseClient {
  const { url, anonKey } = readSupabaseEnv();
  if (!url || !anonKey) {
    throw new Error("Supabase anon environment is not configured");
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export async function getMemberIdFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const accessToken = header.slice("Bearer ".length).trim();
  if (!accessToken) return null;

  const client = createSupabaseAnonClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;

  const memberId = await resolveMemberIdForAuthUser(client, data.user);
  return memberId;
}

async function resolveMemberIdForAuthUser(
  client: SupabaseClient,
  user: User,
): Promise<string | null> {
  const { data, error } = await client
    .from("members")
    .select("id")
    .eq("email", user.email?.toLowerCase() ?? "")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : user.id;
}
