"use client";

import { createContext, useContext } from "react";
import type { ConsultationSessionPayload } from "@/lib/consultation/consultation-client";
import type { ConsultationDataJson, ConsultationSessionRecord } from "@/types/consultation";

export type ConsultationFlowActions = {
  syncError: string | null;
  clearSyncError: () => void;
  completeBlocking: (next: ConsultationSessionRecord) => void;
  completeOptimistic: (input: {
    stepNumber: number;
    priorRecord: ConsultationSessionRecord;
    optimisticRecord: ConsultationSessionRecord;
    savePromise: Promise<ConsultationSessionPayload>;
  }) => void;
};

const ConsultationFlowContext = createContext<ConsultationFlowActions | null>(null);

export function ConsultationFlowProvider({
  value,
  children,
}: {
  value: ConsultationFlowActions;
  children: React.ReactNode;
}) {
  return <ConsultationFlowContext.Provider value={value}>{children}</ConsultationFlowContext.Provider>;
}

export function useConsultationFlowActions(): ConsultationFlowActions {
  const context = useContext(ConsultationFlowContext);
  if (!context) {
    throw new Error("useConsultationFlowActions must be used within ConsultationFlowProvider");
  }
  return context;
}
