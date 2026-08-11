"use client";

import { useState } from "react";
import {
  ConsultationField,
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationInput,
  ConsultationPrimaryButton,
  ConsultationTextarea,
} from "@/components/consultation/ConsultationFlowShell";
import { CONSULTATION_STEP_META } from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import type { ConsultationSessionRecord } from "@/types/consultation";

export function ConsultationStep05PreviousExperience({
  sessionId,
  record,
  onCompleted,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
  onCompleted: (next: ConsultationSessionRecord) => void;
}) {
  const initial = record.data.dataJson.previousExperience ?? {};
  const [hasPreviousExperience, setHasPreviousExperience] = useState<boolean | null>(
    initial.hasPreviousExperience ?? null,
  );
  const [previousMethodsText, setPreviousMethodsText] = useState(
    (initial.previousMethods ?? []).join("、"),
  );
  const [previousResult, setPreviousResult] = useState(initial.previousResult ?? "");
  const [regainedOrStopped, setRegainedOrStopped] = useState(initial.regainedOrStopped ?? "");
  const [whyStoppedOrRegained, setWhyStoppedOrRegained] = useState(initial.whyStoppedOrRegained ?? "");
  const [experienceNotes, setExperienceNotes] = useState(initial.experienceNotes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = CONSULTATION_STEP_META[5];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const previousMethods = previousMethodsText
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = await saveConsultationStepApi(sessionId, 5, {
        previousExperience: {
          hasPreviousExperience: hasPreviousExperience ?? undefined,
          previousMethods,
          previousResult: previousResult.trim() || undefined,
          regainedOrStopped: regainedOrStopped.trim() || undefined,
          whyStoppedOrRegained: whyStoppedOrRegained.trim() || undefined,
          experienceNotes: experienceNotes.trim() || undefined,
        },
      });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法儲存 Step 5");
      }
      onCompleted({ session: payload.session, data: payload.data });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法儲存 Step 5");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConsultationFlowShell step={5} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <p className="rounded-[1.25rem] bg-[#f3ebe3] px-4 py-3 text-sm leading-6 text-[#6f5f57]">
          「你過去有沒有減重、增肌或改變身材的經驗？」
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-full px-4 py-3 text-sm font-medium ${
              hasPreviousExperience === true
                ? "bg-[#2f2622] text-white"
                : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
            }`}
            onClick={() => setHasPreviousExperience(true)}
          >
            有
          </button>
          <button
            type="button"
            className={`flex-1 rounded-full px-4 py-3 text-sm font-medium ${
              hasPreviousExperience === false
                ? "bg-[#2f2622] text-white"
                : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
            }`}
            onClick={() => setHasPreviousExperience(false)}
          >
            沒有
          </button>
        </div>
        {hasPreviousExperience !== false ? (
          <>
            <ConsultationField label="以前用過的方法（選填）" hint="多項可用頓號或逗號分隔">
              <ConsultationInput
                value={previousMethodsText}
                onChange={(event) => setPreviousMethodsText(event.target.value)}
                placeholder="例如：節食、跑步、代餐…"
              />
            </ConsultationField>
            <ConsultationField label="當時結果（選填）">
              <ConsultationInput
                value={previousResult}
                onChange={(event) => setPreviousResult(event.target.value)}
                placeholder="例如：有瘦 5 公斤"
              />
            </ConsultationField>
            <ConsultationField label="後來復胖或停止？（選填）">
              <ConsultationInput
                value={regainedOrStopped}
                onChange={(event) => setRegainedOrStopped(event.target.value)}
              />
            </ConsultationField>
            <ConsultationField label="為什麼沒持續？（選填）">
              <ConsultationTextarea
                value={whyStoppedOrRegained}
                onChange={(event) => setWhyStoppedOrRegained(event.target.value)}
              />
            </ConsultationField>
          </>
        ) : null}
        <ConsultationField label="備註（選填）">
          <ConsultationTextarea value={experienceNotes} onChange={(event) => setExperienceNotes(event.target.value)} />
        </ConsultationField>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading}>
            {loading ? "儲存中…" : "完成經驗記錄，下一步"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
