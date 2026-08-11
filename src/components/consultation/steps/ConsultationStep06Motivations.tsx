"use client";

import { useState } from "react";
import { useConsultationFlowActions } from "@/components/consultation/ConsultationFlowContext";
import {
  ConsultationField,
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationPrimaryButton,
  ConsultationTextarea,
} from "@/components/consultation/ConsultationFlowShell";
import { CONSULTATION_STEP_META } from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import { buildOptimisticStepRecord } from "@/lib/consultation/consultation-step-navigation";
import type { ConsultationSessionRecord } from "@/types/consultation";

export function ConsultationStep06Motivations({
  sessionId,
  record,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
}) {
  const { completeOptimistic } = useConsultationFlowActions();
  const initial = record.data.dataJson.motivations ?? {};
  const [reason1, setReason1] = useState(initial.reason1 ?? "");
  const [reason2, setReason2] = useState(initial.reason2 ?? "");
  const [reason3, setReason3] = useState(initial.reason3 ?? "");
  const [motivationNotes, setMotivationNotes] = useState(initial.motivationNotes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = CONSULTATION_STEP_META[6];
  const hasAtLeastOneReason = [reason1, reason2, reason3].some((value) => value.trim());

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasAtLeastOneReason) {
      setError("請至少記錄一個改變理由。");
      return;
    }
    setLoading(true);
    setError(null);

    const motivations = {
      reason1: reason1.trim() || undefined,
      reason2: reason2.trim() || undefined,
      reason3: reason3.trim() || undefined,
      motivationNotes: motivationNotes.trim() || undefined,
    };

    const optimisticRecord = buildOptimisticStepRecord(record, 6, { motivations });
    completeOptimistic({
      stepNumber: 6,
      priorRecord: record,
      optimisticRecord,
      savePromise: saveConsultationStepApi(sessionId, 6, { motivations }),
    });
    setLoading(false);
  }

  return (
    <ConsultationFlowShell step={6} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="rounded-[1.25rem] bg-[#f3ebe3] px-4 py-3 text-sm leading-6 text-[#6f5f57]">
          「如果這次真的把身材改變成功，對你來說最重要的三個理由是什麼？」
        </p>
        <ConsultationField label="理由 1" hint="請記下客人的原話，不要改寫。">
          <ConsultationTextarea value={reason1} onChange={(event) => setReason1(event.target.value)} />
        </ConsultationField>
        <ConsultationField label="理由 2（選填）">
          <ConsultationTextarea value={reason2} onChange={(event) => setReason2(event.target.value)} />
        </ConsultationField>
        <ConsultationField label="理由 3（選填）">
          <ConsultationTextarea value={reason3} onChange={(event) => setReason3(event.target.value)} />
        </ConsultationField>
        <ConsultationField label="備註（選填）">
          <ConsultationTextarea
            value={motivationNotes}
            onChange={(event) => setMotivationNotes(event.target.value)}
          />
        </ConsultationField>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading || !hasAtLeastOneReason}>
            {loading ? "儲存中…" : "完成理由記錄，下一步"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
