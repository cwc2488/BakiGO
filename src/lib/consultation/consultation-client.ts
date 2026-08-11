export { fetchWithMemberAuth as fetchWithConsultationAuth } from "@/lib/quiz/quiz-member-fetch";

import type { ConsultationBriefSnapshot, ConsultationData, ConsultationSession } from "@/types/consultation";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { setConsultationSessionCache } from "@/lib/consultation/consultation-session-cache";

export type ConsultationSessionPayload = {
  ok?: boolean;
  session?: ConsultationSession;
  data?: ConsultationData;
  error?: string;
  emitConsultationActivity?: boolean;
};

export async function createConsultationSessionApi(customerId: string): Promise<ConsultationSessionPayload> {
  const response = await fetchWithMemberAuth("/api/consultation/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId }),
  });
  const payload = (await response.json()) as ConsultationSessionPayload;
  if (payload.session && payload.data) {
    setConsultationSessionCache(payload.session.id, { session: payload.session, data: payload.data });
  }
  return payload;
}

export async function loadConsultationSessionApi(sessionId: string): Promise<ConsultationSessionPayload> {
  const response = await fetchWithMemberAuth(`/api/consultation/sessions/${sessionId}`);
  const payload = (await response.json()) as ConsultationSessionPayload;
  if (payload.session && payload.data) {
    setConsultationSessionCache(sessionId, { session: payload.session, data: payload.data });
  }
  return payload;
}

export async function saveConsultationStepApi(
  sessionId: string,
  stepNumber: number,
  body: Record<string, unknown>,
): Promise<ConsultationSessionPayload> {
  const response = await fetchWithMemberAuth(
    `/api/consultation/sessions/${sessionId}/step/${stepNumber}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json()) as ConsultationSessionPayload;
  if (payload.session && payload.data) {
    setConsultationSessionCache(sessionId, { session: payload.session, data: payload.data });
  }
  return payload;
}

export async function loadConsultationBriefApi(sessionId: string): Promise<{
  ok?: boolean;
  brief?: ConsultationBriefSnapshot;
  error?: string;
}> {
  const response = await fetchWithMemberAuth(`/api/consultation/sessions/${sessionId}/brief`);
  return (await response.json()) as {
    ok?: boolean;
    brief?: ConsultationBriefSnapshot;
    error?: string;
  };
}
