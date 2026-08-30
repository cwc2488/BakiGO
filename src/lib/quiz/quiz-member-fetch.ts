import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const SESSION_TIMEOUT_MS = 8_000;

export async function fetchWithMemberAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const supabase = createSupabaseBrowserClient();

  let accessToken: string | undefined;
  if (typeof window === "undefined") {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token;
  } else {
    const timed = new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("登入狀態載入逾時，請重新整理後再試"));
      }, SESSION_TIMEOUT_MS);
    });
    const { data } = await Promise.race([supabase.auth.getSession(), timed]);
    accessToken = data.session?.access_token;
  }

  if (!accessToken) {
    throw new Error("請先登入");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers });
}
