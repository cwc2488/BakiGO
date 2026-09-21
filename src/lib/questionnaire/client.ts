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

export async function fetchQuestionnaireDashboard(): Promise<QuestionnaireDashboard> {
  const res = await fetchWithMemberAuth("/api/questionnaire/dashboard", { cache: "no-store" });
  const body = await parseJson<{ dashboard: QuestionnaireDashboard }>(res);
  return body.dashboard;
}

export async function fetchQuestionnaireShare(): Promise<QuestionnaireShareLinkView> {
  const res = await fetchWithMemberAuth("/api/questionnaire/share", { cache: "no-store" });
  const body = await parseJson<{ share: QuestionnaireShareLinkView }>(res);
  return body.share;
}

export async function fetchQuestionnaireLeads(input?: {
  status?: string;
  search?: string;
  page?: number;
}): Promise<{
  leads: QuestionnaireLeadSummary[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}> {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.search) params.set("search", input.search);
  if (input?.page) params.set("page", String(input.page));
  const qs = params.toString();
  const res = await fetchWithMemberAuth(
    `/api/questionnaire/leads${qs ? `?${qs}` : ""}`,
    { cache: "no-store" },
  );
  return parseJson(res);
}

export async function fetchQuestionnaireLead(leadId: string): Promise<QuestionnaireLeadDetail> {
  const res = await fetchWithMemberAuth(
    `/api/questionnaire/leads/${encodeURIComponent(leadId)}`,
    { cache: "no-store" },
  );
  const body = await parseJson<{ lead: QuestionnaireLeadDetail }>(res);
  return body.lead;
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
  return body.lead;
}
