import {
  CACHE_KEYS,
  RESOURCE_TTL,
  getCached,
  invalidateCached,
  invalidateCachedPrefix,
  invalidateFivePlusFiveCaches,
  invalidateQuestionnaireCaches,
  isFresh,
  setCached,
} from "@/lib/client-cache/resource-cache";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type {
  QuestionnaireDashboard,
  QuestionnaireLeadDetail,
  QuestionnaireLeadSummary,
  QuestionnaireShareLinkView,
} from "@/types/questionnaire";

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

export function isFullQuestionnaireLeadDetail(
  value: QuestionnaireLeadDetail | QuestionnaireLeadSummary | null | undefined,
): value is QuestionnaireLeadDetail {
  return Boolean(value && "contactType" in value && "firstResponseAt" in value && "latestResponse" in value);
}

export async function fetchQuestionnaireDashboard(
  init?: RequestInit,
): Promise<QuestionnaireDashboard> {
  const res = await fetchWithMemberAuth("/api/questionnaire/dashboard", {
    cache: "no-store",
    ...init,
  });
  const body = await parseJson<{ dashboard: QuestionnaireDashboard }>(res);
  setCached(CACHE_KEYS.questionnaireDashboard, body.dashboard);
  return body.dashboard;
}

export function readCachedQuestionnaireDashboard(): QuestionnaireDashboard | null {
  return getCached<QuestionnaireDashboard>(CACHE_KEYS.questionnaireDashboard)?.data ?? null;
}

export function isQuestionnaireDashboardFresh(now: number = Date.now()): boolean {
  return isFresh(CACHE_KEYS.questionnaireDashboard, RESOURCE_TTL.questionnaireDashboard, now);
}

export async function fetchQuestionnaireShare(): Promise<QuestionnaireShareLinkView> {
  const res = await fetchWithMemberAuth("/api/questionnaire/share", { cache: "no-store" });
  const body = await parseJson<{ share: QuestionnaireShareLinkView }>(res);
  return body.share;
}

export type QuestionnaireLeadsPageResult = {
  leads: QuestionnaireLeadSummary[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export async function fetchQuestionnaireLeads(
  input?: {
    status?: string;
    search?: string;
    page?: number;
  },
  init?: RequestInit,
): Promise<QuestionnaireLeadsPageResult> {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.search) params.set("search", input.search);
  if (input?.page) params.set("page", String(input.page));
  const qs = params.toString();
  const res = await fetchWithMemberAuth(
    `/api/questionnaire/leads${qs ? `?${qs}` : ""}`,
    { cache: "no-store", ...init },
  );
  const body = await parseJson<QuestionnaireLeadsPageResult>(res);
  const key = CACHE_KEYS.questionnaireLeads(
    input?.status ?? "",
    input?.search ?? "",
    input?.page ?? 1,
  );
  setCached(key, body);
  // Seed detail summaries for warmer navigation (never overwrite fresher full detail)
  for (const lead of body.leads) {
    const existing = getCached<QuestionnaireLeadDetail | QuestionnaireLeadSummary>(
      CACHE_KEYS.questionnaireLead(lead.id),
    );
    if (!existing || !isFullQuestionnaireLeadDetail(existing.data as QuestionnaireLeadSummary)) {
      setCached(CACHE_KEYS.questionnaireLead(lead.id), lead);
    }
  }
  return body;
}

export function readCachedQuestionnaireLeads(input: {
  status?: string;
  search?: string;
  page?: number;
}): QuestionnaireLeadsPageResult | null {
  const key = CACHE_KEYS.questionnaireLeads(
    input.status ?? "",
    input.search ?? "",
    input.page ?? 1,
  );
  return getCached<QuestionnaireLeadsPageResult>(key)?.data ?? null;
}

export function isQuestionnaireLeadsFresh(
  input: { status?: string; search?: string; page?: number },
  now: number = Date.now(),
): boolean {
  const key = CACHE_KEYS.questionnaireLeads(
    input.status ?? "",
    input.search ?? "",
    input.page ?? 1,
  );
  return isFresh(key, RESOURCE_TTL.questionnaireLeads, now);
}

export async function fetchQuestionnaireLead(
  leadId: string,
  init?: RequestInit,
): Promise<QuestionnaireLeadDetail> {
  const res = await fetchWithMemberAuth(
    `/api/questionnaire/leads/${encodeURIComponent(leadId)}`,
    { cache: "no-store", ...init },
  );
  const body = await parseJson<{ lead: QuestionnaireLeadDetail }>(res);
  setCached(CACHE_KEYS.questionnaireLead(leadId), body.lead);
  return body.lead;
}

export function readCachedQuestionnaireLead(
  leadId: string,
): QuestionnaireLeadDetail | QuestionnaireLeadSummary | null {
  return (
    getCached<QuestionnaireLeadDetail | QuestionnaireLeadSummary>(
      CACHE_KEYS.questionnaireLead(leadId),
    )?.data ?? null
  );
}

export function isQuestionnaireLeadFullFresh(leadId: string, now: number = Date.now()): boolean {
  const key = CACHE_KEYS.questionnaireLead(leadId);
  const entry = getCached<QuestionnaireLeadDetail | QuestionnaireLeadSummary>(key);
  if (!entry || !isFullQuestionnaireLeadDetail(entry.data)) return false;
  return now - entry.updatedAt <= RESOURCE_TTL.questionnaireLeadDetail;
}

/** Lightweight detail prefetch for pointer/touch hover — does not block UI. */
export function prefetchQuestionnaireLead(leadId: string): void {
  if (!leadId) return;
  if (isQuestionnaireLeadFullFresh(leadId)) return;
  void fetchQuestionnaireLead(leadId).catch(() => {
    /* warm cache best-effort */
  });
}

export async function patchQuestionnaireLeadStatus(
  leadId: string,
  status: string,
): Promise<QuestionnaireLeadDetail> {
  const res = await fetchWithMemberAuth(
    `/api/questionnaire/leads/${encodeURIComponent(leadId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
  const body = await parseJson<{ lead: QuestionnaireLeadDetail }>(res);
  setCached(CACHE_KEYS.questionnaireLead(leadId), body.lead);
  invalidateCached(CACHE_KEYS.questionnaireDashboard);
  invalidateCachedPrefix("questionnaire:leads:");
  invalidateFivePlusFiveCaches();
  return body.lead;
}

export type DeleteQuestionnaireLeadClientResult = {
  ok: true;
  fishReversed: boolean;
  invitationReversed: boolean;
};

export async function deleteQuestionnaireLead(
  leadId: string,
): Promise<DeleteQuestionnaireLeadClientResult> {
  const res = await fetchWithMemberAuth(
    `/api/questionnaire/leads/${encodeURIComponent(leadId)}`,
    { method: "DELETE" },
  );
  const body = await parseJson<DeleteQuestionnaireLeadClientResult>(res);
  invalidateQuestionnaireCaches();
  invalidateCached(CACHE_KEYS.questionnaireLead(leadId));
  invalidateFivePlusFiveCaches();
  return body;
}

export {
  CACHE_KEYS,
  RESOURCE_TTL,
  invalidateQuestionnaireCaches,
  invalidateFivePlusFiveCaches,
};
