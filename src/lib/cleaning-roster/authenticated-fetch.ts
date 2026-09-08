/**
 * Cleaning-roster authenticated fetch.
 *
 * Reuses the shared Supabase session Bearer helper (`fetchWithMemberAuth`)
 * used by Baki Life / quiz member APIs. Does not weaken Super Admin checks —
 * it only attaches `Authorization: Bearer <access_token>` so
 * `requireCleaningRosterAdmin` can resolve the signed-in member.
 */
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";

export async function cleaningRosterFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithMemberAuth(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed (${response.status})`,
    );
  }

  return body;
}
