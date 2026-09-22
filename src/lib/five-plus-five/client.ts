import {
  CACHE_KEYS,
  RESOURCE_TTL,
  getCached,
  invalidateFivePlusFiveCaches,
  setCached,
} from "@/lib/client-cache/resource-cache";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type {
  FivePlusFiveMemberDetail,
  FivePlusFiveMyStats,
  FivePlusFiveOrgSummary,
  FivePlusFiveReportRow,
} from "@/types/five-plus-five";

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof body === "object" && body && "error" in body && body.error
        ? String(body.error)
        : `Request failed (${res.status})`,
    );
  }
  return body;
}

export type FivePlusFiveMePayload = {
  stats: FivePlusFiveMyStats;
  todayReport: FivePlusFiveReportRow | null;
};

export async function fetchMyFivePlusFive(
  init?: RequestInit,
): Promise<FivePlusFiveMePayload> {
  const res = await fetchWithMemberAuth("/api/5plus5/me", {
    cache: "no-store",
    ...init,
  });
  const body = await parseJson<FivePlusFiveMePayload>(res);
  setCached(CACHE_KEYS.fivePlusFiveMe, body);
  return body;
}

export function readCachedFivePlusFiveMe(): FivePlusFiveMePayload | null {
  return getCached<FivePlusFiveMePayload>(CACHE_KEYS.fivePlusFiveMe)?.data ?? null;
}

export async function upsertMyFivePlusFive(input: {
  reportDate?: string;
  manualFishPoolCount: number;
  manualInvitationFiveStepsCount: number;
}): Promise<{ report: FivePlusFiveReportRow; stats: FivePlusFiveMyStats }> {
  const res = await fetchWithMemberAuth("/api/5plus5/me", {
    method: "PUT",
    body: JSON.stringify({
      reportDate: input.reportDate,
      manualFishPoolCount: input.manualFishPoolCount,
      manualInvitationFiveStepsCount: input.manualInvitationFiveStepsCount,
      // Legacy keys for older clients / temporary compat
      fishPoolCount: input.manualFishPoolCount,
      invitationFiveStepsCount: input.manualInvitationFiveStepsCount,
    }),
  });
  const body = await parseJson<{ report: FivePlusFiveReportRow; stats: FivePlusFiveMyStats }>(
    res,
  );
  invalidateFivePlusFiveCaches();
  setCached(CACHE_KEYS.fivePlusFiveMe, {
    stats: body.stats,
    todayReport: body.report,
  });
  return body;
}

export async function backfillFivePlusFive(input: {
  reportDate: string;
  manualFishPoolCount: number;
  manualInvitationFiveStepsCount: number;
}): Promise<{ report: FivePlusFiveReportRow; stats: FivePlusFiveMyStats }> {
  const res = await fetchWithMemberAuth("/api/5plus5/backfill", {
    method: "POST",
    body: JSON.stringify({
      reportDate: input.reportDate,
      manualFishPoolCount: input.manualFishPoolCount,
      manualInvitationFiveStepsCount: input.manualInvitationFiveStepsCount,
      fishPoolCount: input.manualFishPoolCount,
      invitationFiveStepsCount: input.manualInvitationFiveStepsCount,
    }),
  });
  const body = await parseJson<{ report: FivePlusFiveReportRow; stats: FivePlusFiveMyStats }>(
    res,
  );
  invalidateFivePlusFiveCaches();
  void fetchMyFivePlusFive().catch(() => {
    /* background refresh after backfill */
  });
  return body;
}

export async function fetchFivePlusFiveOrganization(): Promise<FivePlusFiveOrgSummary> {
  const res = await fetchWithMemberAuth("/api/5plus5/organization", { cache: "no-store" });
  const body = await parseJson<{ summary: FivePlusFiveOrgSummary }>(res);
  return body.summary;
}

export async function fetchFivePlusFiveMember(
  memberId: string,
): Promise<FivePlusFiveMemberDetail> {
  const res = await fetchWithMemberAuth(`/api/5plus5/member/${encodeURIComponent(memberId)}`, {
    cache: "no-store",
  });
  const body = await parseJson<{ detail: FivePlusFiveMemberDetail }>(res);
  return body.detail;
}

export { CACHE_KEYS, RESOURCE_TTL, invalidateFivePlusFiveCaches };
