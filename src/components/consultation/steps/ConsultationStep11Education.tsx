"use client";

import { useState } from "react";
import { useConsultationFlowActions } from "@/components/consultation/ConsultationFlowContext";
import {
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationPrimaryButton,
} from "@/components/consultation/ConsultationFlowShell";
import { CONSULTATION_STEP_META } from "@/lib/consultation/consultation-flow-engine";
import { getConsultationEducationCard } from "@/lib/consultation/consultation-education-content";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import { buildOptimisticStepRecord } from "@/lib/consultation/consultation-step-navigation";
import type { ConsultationSessionRecord } from "@/types/consultation";

export function ConsultationStep11Education({
  sessionId,
  record,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
}) {
  const { completeOptimistic } = useConsultationFlowActions();
  const goalType = record.data.dataJson.goals?.goalType ?? "other";
  const card = getConsultationEducationCard(goalType);
  const [acknowledged, setAcknowledged] = useState(record.data.dataJson.education?.acknowledged ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = CONSULTATION_STEP_META[11];

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!acknowledged) {
      setError("請完成原理解說後再繼續。");
      return;
    }
    setLoading(true);
    setError(null);
    const now = new Date().toISOString();
    const education = { goalType, acknowledged: true, acknowledgedAt: now };
    const optimisticRecord = buildOptimisticStepRecord(record, 11, { education });
    completeOptimistic({
      stepNumber: 11,
      priorRecord: record,
      optimisticRecord,
      savePromise: saveConsultationStepApi(sessionId, 11, { educationAcknowledged: true }),
    });
    setLoading(false);
  }

  return (
    <ConsultationFlowShell step={11} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="rounded-[1.5rem] bg-white/90 p-5 ring-1 ring-[#eadfd6]">
          <p className="text-xs font-medium uppercase tracking-wide text-[#c08a98]">{card.goalLabel} · 教學卡</p>
          <p className="mt-3 text-base font-medium text-[#2f2622]">{card.transitionLine}</p>
          <p className="mt-1 text-base font-medium text-[#2f2622]">{card.mindsetLine}</p>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-[#6f5f57]">
            {card.teachingPoints.map((point) => (
              <li key={point}>• {point}</li>
            ))}
          </ul>
          <div className="mt-4 rounded-[1rem] bg-[#f3ebe3] px-4 py-3 text-sm leading-6 text-[#6f5f57]">
            <p className="font-medium text-[#2f2622]">建議說法</p>
            <p className="mt-1">{card.suggestedScript}</p>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-[1.25rem] bg-white px-4 py-4 ring-1 ring-[#eadfd6]">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span className="text-sm leading-6 text-[#6f5f57]">我已完成原理解說，客人已聽懂核心概念。</span>
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading || !acknowledged}>
            {loading ? "儲存中…" : "完成解說，下一步"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
