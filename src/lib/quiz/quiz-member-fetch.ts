import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function fetchWithMemberAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("請先登入");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers });
}
