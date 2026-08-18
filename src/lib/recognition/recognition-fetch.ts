/**
 * Client-side fetch helpers for Recognition Center admin APIs.
 * Re-uses the same fetchWithMemberAuth pattern as other admin modules.
 */

import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type {
  RecognitionAwardDefinition,
  RecognitionEvent,
  RecognitionEventAward,
  RecognitionEventCreateInput,
  RecognitionEventUpdateInput,
} from "@/types/recognition";

async function handleResponse<T>(res: Response, fallback: string): Promise<T> {
  const json = (await res.json()) as { ok?: boolean; error?: string } & Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json.error as string | undefined) ?? fallback);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Award catalog
// ---------------------------------------------------------------------------

export async function fetchAwardCatalog(): Promise<RecognitionAwardDefinition[]> {
  const res = await fetchWithMemberAuth("/api/recognition/catalog");
  const body = await handleResponse<{ awards: RecognitionAwardDefinition[] }>(res, "Failed to load award catalog.");
  return body.awards;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function fetchRecognitionEvents(): Promise<RecognitionEvent[]> {
  const res = await fetchWithMemberAuth("/api/recognition/events");
  const body = await handleResponse<{ events: RecognitionEvent[] }>(res, "Failed to load events.");
  return body.events;
}

export async function fetchRecognitionEvent(eventId: string): Promise<RecognitionEvent> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}`);
  const body = await handleResponse<{ event: RecognitionEvent }>(res, "Failed to load event.");
  return body.event;
}

export async function createRecognitionEvent(
  input: Omit<RecognitionEventCreateInput, "createdByMemberId">,
): Promise<RecognitionEvent> {
  const res = await fetchWithMemberAuth("/api/recognition/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = await handleResponse<{ event: RecognitionEvent }>(res, "Failed to create event.");
  return body.event;
}

export async function updateRecognitionEvent(
  eventId: string,
  input: RecognitionEventUpdateInput,
): Promise<RecognitionEvent> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const body = await handleResponse<{ event: RecognitionEvent }>(res, "Failed to update event.");
  return body.event;
}

// ---------------------------------------------------------------------------
// Event awards
// ---------------------------------------------------------------------------

export async function fetchEventAwards(eventId: string): Promise<RecognitionEventAward[]> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/awards`);
  const body = await handleResponse<{ awards: RecognitionEventAward[] }>(res, "Failed to load event awards.");
  return body.awards;
}

export async function updateEventAward(
  eventId: string,
  awardId: string,
  input: { isEnabled?: boolean; sortOrder?: number },
): Promise<RecognitionEventAward> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/awards/${awardId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const body = await handleResponse<{ award: RecognitionEventAward }>(res, "Failed to update award.");
  return body.award;
}

export async function reorderEventAwards(
  eventId: string,
  orderedAwardIds: string[],
): Promise<void> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/awards/reorder`, {
    method: "POST",
    body: JSON.stringify({ orderedAwardIds }),
  });
  await handleResponse<{ ok: boolean }>(res, "Failed to reorder awards.");
}
