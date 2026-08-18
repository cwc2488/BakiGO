/**
 * Client-side fetch helpers for Recognition Center admin APIs.
 * Re-uses the same fetchWithMemberAuth pattern as other admin modules.
 */

import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type {
  RecognitionAwardDefinition,
  RecognitionCandidate,
  RecognitionCandidateUpdateInput,
  RecognitionConsolidationResult,
  RecognitionEvent,
  RecognitionEventAward,
  RecognitionEventSummary,
  RecognitionPublicEvent,
  RecognitionRawSubmissionView,
  RecognitionApprovedRoster,
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

export async function fetchRecognitionEvents(filter?: {
  year?: number;
  month?: number;
}): Promise<RecognitionEventSummary[]> {
  const params = new URLSearchParams();
  if (filter?.year !== undefined) params.set("year", String(filter.year));
  if (filter?.month !== undefined) params.set("month", String(filter.month));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const res = await fetchWithMemberAuth(`/api/recognition/events${suffix}`);
  const body = await handleResponse<{ events: RecognitionEventSummary[] }>(res, "Failed to load events.");
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

export async function fetchRecognitionEventToken(eventId: string): Promise<{
  token: string | null;
  url: string | null;
  rotatedAt: string | null;
}> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/token`);
  const body = await handleResponse<{ token: string | null; url: string | null; rotatedAt: string | null }>(
    res,
    "Failed to load public token.",
  );
  return body;
}

export async function rotateRecognitionEventToken(eventId: string): Promise<{
  token: string | null;
  url: string | null;
  rotatedAt: string | null;
}> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/token`, {
    method: "POST",
  });
  const body = await handleResponse<{ token: string | null; url: string | null; rotatedAt: string | null }>(
    res,
    "Failed to rotate public token.",
  );
  return body;
}

export async function fetchRecognitionRawSubmissions(eventId: string): Promise<{
  totalSubmissions: number;
  totalEntries: number;
  submissions: RecognitionRawSubmissionView[];
}> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/submissions`);
  return handleResponse<{
    totalSubmissions: number;
    totalEntries: number;
    submissions: RecognitionRawSubmissionView[];
  }>(res, "Failed to load raw submissions.");
}

export async function fetchRecognitionPublicEvent(token: string): Promise<RecognitionPublicEvent> {
  const res = await fetch(`/api/recognition/public/${encodeURIComponent(token)}`, {
    method: "GET",
  });
  const body = await handleResponse<{ event: RecognitionPublicEvent }>(res, "Failed to load event.");
  return body.event;
}

export async function submitRecognitionPublicForm(token: string, formData: FormData): Promise<{
  submissionId: string;
  message: string;
}> {
  const res = await fetch(`/api/recognition/public/${encodeURIComponent(token)}/submissions`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<{ submissionId: string; message: string }>(res, "Submission failed.");
}

export async function syncRecognitionCandidates(eventId: string): Promise<RecognitionConsolidationResult> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/candidates/sync`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  const body = await handleResponse<{ result: RecognitionConsolidationResult }>(res, "Failed to sync candidates.");
  return body.result;
}

export async function fetchRecognitionCandidates(
  eventId: string,
  filter?: { status?: string; awardId?: string; q?: string },
): Promise<RecognitionCandidate[]> {
  const params = new URLSearchParams();
  if (filter?.status) params.set("status", filter.status);
  if (filter?.awardId) params.set("awardId", filter.awardId);
  if (filter?.q) params.set("q", filter.q);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/candidates${suffix}`);
  const body = await handleResponse<{ candidates: RecognitionCandidate[] }>(res, "Failed to load candidates.");
  return body.candidates;
}

export async function updateRecognitionCandidate(
  eventId: string,
  candidateId: string,
  input: RecognitionCandidateUpdateInput,
): Promise<RecognitionCandidate> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/candidates/${candidateId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const body = await handleResponse<{ candidate: RecognitionCandidate }>(res, "Failed to update candidate.");
  return body.candidate;
}

export async function reorderRecognitionCandidates(
  eventId: string,
  eventAwardId: string,
  orderedCandidateIds: string[],
): Promise<void> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/candidates/reorder`, {
    method: "POST",
    body: JSON.stringify({ eventAwardId, orderedCandidateIds }),
  });
  await handleResponse<{ ok: boolean }>(res, "Failed to reorder candidates.");
}

export async function fetchRecognitionApprovedRoster(eventId: string): Promise<RecognitionApprovedRoster> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/roster`);
  const body = await handleResponse<{ roster: RecognitionApprovedRoster }>(res, "Failed to load approved roster.");
  return body.roster;
}

export async function fetchRecognitionTextRoster(eventId: string): Promise<{ text: string; roster: RecognitionApprovedRoster }> {
  const res = await fetchWithMemberAuth(`/api/recognition/events/${eventId}/roster/text`);
  return handleResponse<{ text: string; roster: RecognitionApprovedRoster }>(res, "Failed to load text roster.");
}

export async function fetchRecognitionCandidatePhotoObjectUrl(
  eventId: string,
  candidateId: string,
  sourceEntryId: string,
): Promise<string> {
  const res = await fetchWithMemberAuth(
    `/api/recognition/events/${eventId}/candidates/${candidateId}/photo?sourceEntryId=${encodeURIComponent(sourceEntryId)}`,
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? "Failed to load photo.");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
