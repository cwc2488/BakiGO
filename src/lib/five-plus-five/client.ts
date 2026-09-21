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

export async function fetchMyFivePlusFive(): Promise<{
  stats: FivePlusFiveMyStats;
  todayReport: FivePlusFiveReportRow | null;
}> {
  const res = await fetchWithMemberAuth("/api/5plus5/me", { cache: "no-store" });
  return parseJson(res);
}

export async function upsertMyFivePlusFive(input: {
  reportDate?: string;
  fishPoolCount: number;
  invitationFiveStepsCount: number;
}): Promise<{ report: FivePlusFiveReportRow; stats: FivePlusFiveMyStats }> {
  const res = await fetchWithMemberAuth("/api/5plus5/me", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function backfillFivePlusFive(input: {
  reportDate: string;
  fishPoolCount: number;
  invitationFiveStepsCount: number;
}): Promise<{ report: FivePlusFiveReportRow; stats: FivePlusFiveMyStats }> {
  const res = await fetchWithMemberAuth("/api/5plus5/backfill", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseJson(res);
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
