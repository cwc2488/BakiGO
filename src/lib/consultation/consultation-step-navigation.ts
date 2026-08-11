import { getStepAfterCompletion } from "@/lib/consultation/consultation-flow-engine";
import type { ConsultationDataJson, ConsultationSessionRecord } from "@/types/consultation";

export function buildOptimisticStepRecord(
  record: ConsultationSessionRecord,
  completedStep: number,
  dataJsonPatch: Partial<ConsultationDataJson>,
): ConsultationSessionRecord {
  return {
    session: {
      ...record.session,
      currentStep: getStepAfterCompletion(completedStep),
    },
    data: {
      ...record.data,
      dataJson: {
        ...record.data.dataJson,
        ...dataJsonPatch,
      },
    },
  };
}

export function consultationStepPath(sessionId: string, stepNumber: number): string {
  return `/consultation/${sessionId}/step/${stepNumber}`;
}

export function prefetchConsultationSteps(
  prefetch: (href: string) => void,
  sessionId: string,
  stepNumbers: number[],
): void {
  for (const stepNumber of stepNumbers) {
    prefetch(consultationStepPath(sessionId, stepNumber));
  }
}
