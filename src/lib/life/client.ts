import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";

export async function lifeFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchWithMemberAuth(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : `Request failed (${res.status})`,
    );
  }
  return body as T;
}
