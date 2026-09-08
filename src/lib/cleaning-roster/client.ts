/** Client helpers for admin cleaning roster (loaded only on the tool page). */

import type {
  CleaningRosterArea,
  CleaningRosterBootstrap,
  CleaningRosterMember,
  CleaningRosterPreview,
} from "@/types/cleaning-roster";

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

export async function fetchCleaningRosterBootstrap(): Promise<CleaningRosterBootstrap> {
  const response = await fetch("/api/admin/cleaning-roster", { cache: "no-store" });
  const body = await parseJson<{ ok: true; data: CleaningRosterBootstrap }>(response);
  return body.data;
}

export async function createCleaningArea(name: string): Promise<CleaningRosterArea> {
  const response = await fetch("/api/admin/cleaning-roster/areas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await parseJson<{ ok: true; area: CleaningRosterArea }>(response);
  return body.area;
}

export async function updateCleaningArea(id: string, name: string): Promise<CleaningRosterArea> {
  const response = await fetch(`/api/admin/cleaning-roster/areas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await parseJson<{ ok: true; area: CleaningRosterArea }>(response);
  return body.area;
}

export async function deleteCleaningArea(id: string): Promise<void> {
  const response = await fetch(`/api/admin/cleaning-roster/areas/${id}`, {
    method: "DELETE",
  });
  await parseJson<{ ok: true }>(response);
}

export async function createCleaningMember(name: string): Promise<CleaningRosterMember> {
  const response = await fetch("/api/admin/cleaning-roster/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await parseJson<{ ok: true; member: CleaningRosterMember }>(response);
  return body.member;
}

export async function updateCleaningMember(
  id: string,
  name: string,
): Promise<CleaningRosterMember> {
  const response = await fetch(`/api/admin/cleaning-roster/members/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await parseJson<{ ok: true; member: CleaningRosterMember }>(response);
  return body.member;
}

export async function deleteCleaningMember(id: string): Promise<void> {
  const response = await fetch(`/api/admin/cleaning-roster/members/${id}`, {
    method: "DELETE",
  });
  await parseJson<{ ok: true }>(response);
}

export async function drawCleaningPreview(): Promise<CleaningRosterPreview> {
  const response = await fetch("/api/admin/cleaning-roster/draw", {
    method: "POST",
  });
  const body = await parseJson<{ ok: true; preview: CleaningRosterPreview }>(response);
  return body.preview;
}

export async function confirmCleaningPreview(preview: CleaningRosterPreview): Promise<{
  duplicate: boolean;
  data: CleaningRosterBootstrap;
}> {
  const response = await fetch("/api/admin/cleaning-roster/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preview),
  });
  return parseJson<{ ok: true; duplicate: boolean; data: CleaningRosterBootstrap }>(response);
}

export async function resetCleaningFairness(): Promise<CleaningRosterBootstrap> {
  const response = await fetch("/api/admin/cleaning-roster/reset-fairness", {
    method: "POST",
  });
  const body = await parseJson<{ ok: true; data: CleaningRosterBootstrap }>(response);
  return body.data;
}
