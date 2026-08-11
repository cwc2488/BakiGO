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
import { CONSULTATION_STEP_META, createDefaultHealthData } from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import { buildOptimisticStepRecord } from "@/lib/consultation/consultation-step-navigation";
import type { ConsultationHealthData, ConsultationSessionRecord } from "@/types/consultation";

export function ConsultationStep02HealthConcern({
  sessionId,
  record,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
}) {
  const { completeOptimistic } = useConsultationFlowActions();
  const initial = record.data.dataJson.health ?? createDefaultHealthData();
  const [chronicConditions, setChronicConditions] = useState(initial.chronicConditions ?? "");
  const [longTermMedications, setLongTermMedications] = useState(initial.longTermMedications ?? "");
  const [recentHealthChanges, setRecentHealthChanges] = useState(initial.recentHealthChanges ?? "");
  const [allergies, setAllergies] = useState(initial.allergies ?? "");
  const [surgeriesOrInjuries, setSurgeriesOrInjuries] = useState(initial.surgeriesOrInjuries ?? "");
  const [partnerNotes, setPartnerNotes] = useState(initial.partnerNotes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = CONSULTATION_STEP_META[2];

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const health: ConsultationHealthData = {
      safetyReviewStatus: "pending_rules",
      chronicConditions: chronicConditions.trim() || undefined,
      longTermMedications: longTermMedications.trim() || undefined,
      recentHealthChanges: recentHealthChanges.trim() || undefined,
      allergies: allergies.trim() || undefined,
      surgeriesOrInjuries: surgeriesOrInjuries.trim() || undefined,
      partnerNotes: partnerNotes.trim() || undefined,
    };

    const optimisticRecord = buildOptimisticStepRecord(record, 2, { health });
    completeOptimistic({
      stepNumber: 2,
      priorRecord: record,
      optimisticRecord,
      savePromise: saveConsultationStepApi(sessionId, 2, { health }),
    });
    setLoading(false);
  }

  return (
    <ConsultationFlowShell step={2} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="rounded-[1.25rem] bg-[#f3ebe3] px-4 py-3 text-sm leading-6 text-[#6f5f57]">
          這一步只記錄健康背景，不代表已完成安全審核。目前安全狀態為「待審核（pending_review）」，正式規則完成前不會自動判定為安全。
        </p>
        <ConsultationField label="長期健康狀況（選填）">
          <ConsultationTextarea
            value={chronicConditions}
            onChange={(event) => setChronicConditions(event.target.value)}
            placeholder="例如：高血壓、甲狀腺問題…"
          />
        </ConsultationField>
        <ConsultationField label="長期用藥（選填）">
          <ConsultationTextarea
            value={longTermMedications}
            onChange={(event) => setLongTermMedications(event.target.value)}
            placeholder="目前固定服用的藥物或保健品"
          />
        </ConsultationField>
        <ConsultationField label="近期健康變化（選填）">
          <ConsultationTextarea
            value={recentHealthChanges}
            onChange={(event) => setRecentHealthChanges(event.target.value)}
          />
        </ConsultationField>
        <ConsultationField label="過敏（選填）">
          <ConsultationTextarea value={allergies} onChange={(event) => setAllergies(event.target.value)} />
        </ConsultationField>
        <ConsultationField label="手術或重大傷害史（選填）">
          <ConsultationTextarea
            value={surgeriesOrInjuries}
            onChange={(event) => setSurgeriesOrInjuries(event.target.value)}
          />
        </ConsultationField>
        <ConsultationField label="夥伴備註（選填）">
          <ConsultationTextarea
            value={partnerNotes}
            onChange={(event) => setPartnerNotes(event.target.value)}
            placeholder="現場觀察或需追蹤事項"
          />
        </ConsultationField>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading}>
            {loading ? "儲存中…" : "完成健康關懷，下一步"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
