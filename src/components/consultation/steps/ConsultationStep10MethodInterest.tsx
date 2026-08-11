"use client";

import { useState } from "react";
import {
  ConsultationField,
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationPrimaryButton,
  ConsultationTextarea,
} from "@/components/consultation/ConsultationFlowShell";
import {
  CONSULTATION_METHOD_INTEREST_LABELS,
  CONSULTATION_STEP_META,
} from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import type { ConsultationMethodInterest, ConsultationSessionRecord } from "@/types/consultation";

const INTEREST_OPTIONS = Object.keys(CONSULTATION_METHOD_INTEREST_LABELS) as ConsultationMethodInterest[];

export function ConsultationStep10MethodInterest({
  sessionId,
  record,
  onCompleted,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
  onCompleted: (next: ConsultationSessionRecord) => void;
}) {
  const initial = record.data.dataJson.methodInterest;
  const [interest, setInterest] = useState<ConsultationMethodInterest | "">(initial?.interest ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = CONSULTATION_STEP_META[10];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!interest) {
      setError("請確認客人是否願意了解成功案例背後的方法。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await saveConsultationStepApi(sessionId, 10, {
        interest,
        methodInterestNotes: notes.trim() || undefined,
      });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法儲存 Step 10");
      }
      onCompleted({ session: payload.session, data: payload.data });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法儲存 Step 10");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConsultationFlowShell step={10} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <p className="rounded-[1.25rem] bg-[#f3ebe3] px-4 py-3 text-sm leading-6 text-[#6f5f57]">
          「看完這些跟你狀況相近的案例，你願不願意了解他們是怎麼做到的？」
        </p>
        <div className="space-y-2">
          {INTEREST_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`w-full rounded-[1.25rem] px-4 py-4 text-left text-sm font-medium ${
                interest === option
                  ? "bg-[#2f2622] text-white"
                  : "bg-white text-[#2f2622] ring-1 ring-[#eadfd6]"
              }`}
              onClick={() => setInterest(option)}
            >
              {CONSULTATION_METHOD_INTEREST_LABELS[option]}
            </button>
          ))}
        </div>
        <ConsultationField label="備註（選填）" hint="若選「還不確定」，可記錄夥伴後續溝通重點。">
          <ConsultationTextarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </ConsultationField>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading || !interest}>
            {loading ? "儲存中…" : "確認意願，下一步"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
