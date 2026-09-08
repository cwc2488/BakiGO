/**
 * Lose2kg authenticated fetch — page-scoped; attaches Bearer for Super Admin APIs.
 */
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";

export async function lose2kgFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithMemberAuth(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed (${response.status})`,
    );
  }

  return body;
}
