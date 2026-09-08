import { lose2kgFetch } from "@/lib/lose2kg/authenticated-fetch";
import type {
  Lose2kgPeriod,
  Lose2kgPrize,
} from "@/types/lose2kg";

export async function fetchLose2kgSuggestName(): Promise<string> {
  const body = await lose2kgFetch<{ ok: true; name: string }>("/api/admin/lose2kg/suggest-name", {
    cache: "no-store",
  });
  return body.name;
}

export async function createLose2kgPeriodDraft(input: {
  name: string;
  firstMeasurementDate: string;
  measurementDates: [string, string, string, string];
  staffPassword: string;
}): Promise<{ period: Lose2kgPeriod; liveToken: string; staffToken: string }> {
  const body = await lose2kgFetch<{
    ok: true;
    period: Lose2kgPeriod;
    liveToken: string;
    staffToken: string;
  }>("/api/admin/lose2kg/periods/draft", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body;
}

export async function startLose2kgPeriod(periodId: string): Promise<{
  period: Lose2kgPeriod;
  liveUrl: string;
  staffUrl: string;
  liveToken: string;
  staffToken: string;
}> {
  const body = await lose2kgFetch<{
    ok: true;
    period: Lose2kgPeriod;
    liveUrl: string;
    staffUrl: string;
    liveToken: string;
    staffToken: string;
  }>(`/api/admin/lose2kg/periods/${periodId}/start`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return body;
}

export async function regenerateLose2kgLiveToken(periodId: string) {
  return lose2kgFetch<{ ok: true; period: Lose2kgPeriod; liveUrl: string; liveToken: string }>(
    `/api/admin/lose2kg/periods/${periodId}/live-token`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function regenerateLose2kgStaffToken(periodId: string) {
  return lose2kgFetch<{ ok: true; period: Lose2kgPeriod; staffUrl: string; staffToken: string }>(
    `/api/admin/lose2kg/periods/${periodId}/staff-token`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function updateLose2kgStaffPassword(periodId: string, password: string) {
  return lose2kgFetch<{ ok: true; period: Lose2kgPeriod }>(
    `/api/admin/lose2kg/periods/${periodId}/staff-password`,
    { method: "POST", body: JSON.stringify({ password }) },
  );
}

export async function revokeLose2kgStaffSessions(periodId: string) {
  return lose2kgFetch<{ ok: true }>(`/api/admin/lose2kg/periods/${periodId}/revoke-staff`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function patchLose2kgPeriodV2(
  periodId: string,
  patch: {
    name?: string;
    status?: Lose2kgPeriod["status"];
    measurementDates?: [string, string, string, string];
    publicShowWeights?: boolean;
    publicEnabled?: boolean;
  },
) {
  return lose2kgFetch<{ ok: true; period: Lose2kgPeriod }>(
    `/api/admin/lose2kg/periods/${periodId}/v2`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export async function fetchLose2kgControlCenter(periodId: string) {
  return lose2kgFetch<{
    ok: true;
    period: Lose2kgPeriod;
    liveUrl: string | null;
    staffUrl: string | null;
    liveToken: string | null;
    staffToken: string | null;
    prizes: Lose2kgPrize[];
  }>(`/api/admin/lose2kg/periods/${periodId}/control-center`, { cache: "no-store" });
}

export async function deleteLose2kgPeriod(periodId: string) {
  return lose2kgFetch<{ ok: true }>(`/api/admin/lose2kg/periods/${periodId}`, {
    method: "DELETE",
  });
}

export type { Lose2kgPrize };
