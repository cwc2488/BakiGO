import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type {
  ConsultationAiApiResponse,
  ConsultationAiOutputRecord,
  ConsultationAiPointKey,
} from "@/types/consultation-ai";
import type { ConsultationBarriersData, ConsultationReadinessData } from "@/types/consultation";

export async function loadConsultationAiOutputApi(
  sessionId: string,
  pointKey: ConsultationAiPointKey,
): Promise<{ ok?: boolean; output?: ConsultationAiOutputRecord | null; error?: string }> {
  const response = await fetchWithMemberAuth(
    `/api/consultation/sessions/${sessionId}/ai/${pointKey}`,
  );
  return (await response.json()) as {
    ok?: boolean;
    output?: ConsultationAiOutputRecord | null;
    error?: string;
  };
}

export async function generateConsultationAiInsightApi(
  sessionId: string,
  pointKey: ConsultationAiPointKey,
  body?: {
    regenerate?: boolean;
    barrierDraft?: ConsultationBarriersData;
    readinessDraft?: Pick<
      ConsultationReadinessData,
      "readyIfBarrierSolved" | "notReadyReason" | "followUpNotes"
    >;
  },
): Promise<ConsultationAiApiResponse> {
  const response = await fetchWithMemberAuth(
    `/api/consultation/sessions/${sessionId}/ai/${pointKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
  );
  return (await response.json()) as ConsultationAiApiResponse;
}
