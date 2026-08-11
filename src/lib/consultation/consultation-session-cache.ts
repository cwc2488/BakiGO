import type { ConsultationSessionRecord } from "@/types/consultation";

type CachedConsultationSession = {
  sessionId: string;
  record: ConsultationSessionRecord;
  updatedAt: number;
};

let consultationSessionCache: CachedConsultationSession | null = null;

export function setConsultationSessionCache(
  sessionId: string,
  record: ConsultationSessionRecord,
): void {
  consultationSessionCache = {
    sessionId,
    record,
    updatedAt: Date.now(),
  };
}

export function getConsultationSessionCache(sessionId: string): ConsultationSessionRecord | null {
  if (consultationSessionCache?.sessionId !== sessionId) {
    return null;
  }
  return consultationSessionCache.record;
}

export function clearConsultationSessionCache(): void {
  consultationSessionCache = null;
}

export function consultationSessionCacheCoversStep(
  record: ConsultationSessionRecord,
  stepNumber: number,
): boolean {
  if (record.session.status === "not_ready") {
    return stepNumber <= 8;
  }
  if (record.session.status === "follow_up") {
    return stepNumber <= record.session.currentStep;
  }
  if (record.session.status === "completed") {
    return stepNumber <= 14;
  }
  return record.session.currentStep >= stepNumber;
}
