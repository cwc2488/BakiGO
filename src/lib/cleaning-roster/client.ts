/** Client helpers for admin cleaning roster (loaded only on the tool page). */

import { cleaningRosterFetch } from "@/lib/cleaning-roster/authenticated-fetch";
import type {
  CleaningRosterArea,
  CleaningRosterBootstrap,
  CleaningRosterMember,
  CleaningRosterPreview,
} from "@/types/cleaning-roster";

export async function fetchCleaningRosterBootstrap(): Promise<CleaningRosterBootstrap> {
  const body = await cleaningRosterFetch<{ ok: true; data: CleaningRosterBootstrap }>(
    "/api/admin/cleaning-roster",
    { cache: "no-store" },
  );
  return body.data;
}

export async function createCleaningArea(name: string): Promise<CleaningRosterArea> {
  const body = await cleaningRosterFetch<{ ok: true; area: CleaningRosterArea }>(
    "/api/admin/cleaning-roster/areas",
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
  );
  return body.area;
}

export async function updateCleaningArea(id: string, name: string): Promise<CleaningRosterArea> {
  const body = await cleaningRosterFetch<{ ok: true; area: CleaningRosterArea }>(
    `/api/admin/cleaning-roster/areas/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name }),
    },
  );
  return body.area;
}

export async function deleteCleaningArea(id: string): Promise<void> {
  await cleaningRosterFetch<{ ok: true }>(`/api/admin/cleaning-roster/areas/${id}`, {
    method: "DELETE",
  });
}

export async function createCleaningMember(name: string): Promise<CleaningRosterMember> {
  const body = await cleaningRosterFetch<{ ok: true; member: CleaningRosterMember }>(
    "/api/admin/cleaning-roster/members",
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
  );
  return body.member;
}

export async function updateCleaningMember(
  id: string,
  name: string,
): Promise<CleaningRosterMember> {
  const body = await cleaningRosterFetch<{ ok: true; member: CleaningRosterMember }>(
    `/api/admin/cleaning-roster/members/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name }),
    },
  );
  return body.member;
}

export async function deleteCleaningMember(id: string): Promise<void> {
  await cleaningRosterFetch<{ ok: true }>(`/api/admin/cleaning-roster/members/${id}`, {
    method: "DELETE",
  });
}

export async function drawCleaningPreview(): Promise<CleaningRosterPreview> {
  const body = await cleaningRosterFetch<{ ok: true; preview: CleaningRosterPreview }>(
    "/api/admin/cleaning-roster/draw",
    { method: "POST" },
  );
  return body.preview;
}

export async function confirmCleaningPreview(preview: CleaningRosterPreview): Promise<{
  duplicate: boolean;
  data: CleaningRosterBootstrap;
}> {
  return cleaningRosterFetch<{ ok: true; duplicate: boolean; data: CleaningRosterBootstrap }>(
    "/api/admin/cleaning-roster/confirm",
    {
      method: "POST",
      body: JSON.stringify(preview),
    },
  );
}

export async function resetCleaningFairness(): Promise<CleaningRosterBootstrap> {
  const body = await cleaningRosterFetch<{ ok: true; data: CleaningRosterBootstrap }>(
    "/api/admin/cleaning-roster/reset-fairness",
    { method: "POST" },
  );
  return body.data;
}
