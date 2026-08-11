"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  ConsultationField,
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationInput,
  ConsultationPrimaryButton,
  ConsultationTextarea,
} from "@/components/consultation/ConsultationFlowShell";
import {
  CONSULTATION_OUTCOME_LABELS,
  CONSULTATION_STEP_META,
} from "@/lib/consultation/consultation-flow-engine";
import { emitConsultationCompletedActivity } from "@/lib/consultation/consultation-activity";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import { setConsultationSessionCache } from "@/lib/consultation/consultation-session-cache";
import type { ConsultationOutcomeValue, ConsultationSessionRecord } from "@/types/consultation";

const OUTCOME_OPTIONS = Object.keys(CONSULTATION_OUTCOME_LABELS) as ConsultationOutcomeValue[];

export function ConsultationStep14Outcome({
  sessionId,
  record,
  onCompleted,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
  onCompleted: (next: ConsultationSessionRecord) => void;
}) {
  const router = useRouter();
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const initial = record.data.dataJson.outcome;
  const [outcome, setOutcome] = useState<ConsultationOutcomeValue | "">(initial?.outcome ?? "");
  const [customerQuestions, setCustomerQuestions] = useState(initial?.customerQuestions ?? "");
  const [objections, setObjections] = useState(initial?.objections ?? "");
  const [nextStep, setNextStep] = useState(initial?.nextStep ?? "");
  const [followUpDate, setFollowUpDate] = useState(initial?.followUpDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = CONSULTATION_STEP_META[14];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!outcome) {
      setError("請記錄這次諮詢的結果。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await saveConsultationStepApi(sessionId, 14, {
        outcome: {
          outcome,
          customerQuestions: customerQuestions.trim() || undefined,
          objections: objections.trim() || undefined,
          nextStep: nextStep.trim() || undefined,
          followUpDate: followUpDate.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法完成諮詢");
      }
      const nextRecord = { session: payload.session, data: payload.data };
      setConsultationSessionCache(sessionId, nextRecord);
      if (payload.emitConsultationActivity) {
        emitConsultationCompletedActivity(
          {
            customerId: payload.session.customerId,
            consultationSessionId: sessionId,
          },
          storage,
        );
      }
      onCompleted(nextRecord);
      if (payload.session.status === "completed") {
        router.push(`/consultation/${sessionId}/brief`);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法完成諮詢");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConsultationFlowShell step={14} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="space-y-2">
          {OUTCOME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`w-full rounded-[1.25rem] px-4 py-4 text-left text-sm font-medium ${
                outcome === option
                  ? "bg-[#2f2622] text-white"
                  : "bg-white text-[#2f2622] ring-1 ring-[#eadfd6]"
              }`}
              onClick={() => setOutcome(option)}
            >
              {CONSULTATION_OUTCOME_LABELS[option]}
            </button>
          ))}
        </div>
        <ConsultationField label="客人疑問（選填）">
          <ConsultationTextarea value={customerQuestions} onChange={(event) => setCustomerQuestions(event.target.value)} />
        </ConsultationField>
        <ConsultationField label="疑慮／反對意見（選填）">
          <ConsultationTextarea value={objections} onChange={(event) => setObjections(event.target.value)} />
        </ConsultationField>
        <ConsultationField label="下一步安排（選填）">
          <ConsultationTextarea value={nextStep} onChange={(event) => setNextStep(event.target.value)} />
        </ConsultationField>
        <ConsultationField label="追蹤日期（選填）">
          <ConsultationInput type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
        </ConsultationField>
        <ConsultationField label="備註（選填）">
          <ConsultationTextarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </ConsultationField>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading || !outcome}>
            {loading ? "完成中…" : "完成諮詢"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
