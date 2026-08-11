import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";

export async function fetchCoachingWithMemberAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetchWithMemberAuth(input, init);
}
