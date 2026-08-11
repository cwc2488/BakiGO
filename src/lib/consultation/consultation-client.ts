export { fetchWithMemberAuth as fetchWithConsultationAuth } from "@/lib/quiz/quiz-member-fetch";

import type { ConsultationData, ConsultationSession } from "@/types/consultation";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";

export type ConsultationSessionPayload = {
  ok?: boolean;
  session?: ConsultationSession;
  data?: ConsultationData;
  error?: string;
};

export async function createConsultationSessionApi(customerId: string): Promise<ConsultationSessionPayload> {
  const response = await fetchWithMemberAuth("/api/consultation/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId }),
  });
  return (await response.json()) as ConsultationSessionPayload;
}

export async function loadConsultationSessionApi(sessionId: string): Promise<ConsultationSessionPayload> {
  const response = await fetchWithMemberAuth(`/api/consultation/sessions/${sessionId}`);
  return (await response.json()) as ConsultationSessionPayload;
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
  return (await response.json()) as ConsultationSessionPayload;
}
