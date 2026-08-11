"use client";

import { useMemo, useState } from "react";
import { ConsultationBodyDataSummary } from "@/components/consultation/ConsultationBodyDataSummary";
import {
  ConsultationField,
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationInput,
  ConsultationPrimaryButton,
  ConsultationTextarea,
} from "@/components/consultation/ConsultationFlowShell";
import {
  CONSULTATION_GOAL_TYPE_LABELS,
  CONSULTATION_STEP_META,
} from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { ConsultationGoalType, ConsultationSessionRecord } from "@/types/consultation";

const GOAL_TYPES = Object.keys(CONSULTATION_GOAL_TYPE_LABELS) as ConsultationGoalType[];

export function ConsultationStep04DataReviewGoals({
  sessionId,
  record,
  onCompleted,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
  onCompleted: (next: ConsultationSessionRecord) => void;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const repo = useMemo(() => createCustomerRepository(storage), [storage]);
  const customer = repo.getCustomerById(record.session.customerId);
  const bodyRecord = record.session.bodyCompositionRecordId
    ? repo.getAllBodyRecords().find((item) => item.id === record.session.bodyCompositionRecordId)
    : undefined;

  const initial = record.data.dataJson.goals ?? {};
  const [goalType, setGoalType] = useState<ConsultationGoalType | "">(initial.goalType ?? "");
  const [targetWeightKg, setTargetWeightKg] = useState(
    initial.targetWeightKg !== undefined ? String(initial.targetWeightKg) : "",
  );
  const [targetBodyFatPercent, setTargetBodyFatPercent] = useState(
    initial.targetBodyFatPercent !== undefined ? String(initial.targetBodyFatPercent) : "",
  );
  const [desiredBodyDescription, setDesiredBodyDescription] = useState(initial.desiredBodyDescription ?? "");
  const [goalNotes, setGoalNotes] = useState(initial.goalNotes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = CONSULTATION_STEP_META[4];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = await saveConsultationStepApi(sessionId, 4, {
        goals: {
          goalType: goalType || undefined,
          targetWeightKg: targetWeightKg.trim() ? Number(targetWeightKg) : undefined,
          targetBodyFatPercent: targetBodyFatPercent.trim() ? Number(targetBodyFatPercent) : undefined,
          desiredBodyDescription: desiredBodyDescription.trim() || undefined,
          goalNotes: goalNotes.trim() || undefined,
        },
      });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法儲存 Step 4");
      }
      onCompleted({ session: payload.session, data: payload.data });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法儲存 Step 4");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConsultationFlowShell step={4} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <ConsultationBodyDataSummary heightCm={customer?.heightCm} bodyRecord={bodyRecord} />
        <p className="text-sm leading-6 text-[#6f5f57]">
          請搭配你的解說方式，向客人說明以上數據，並記錄這次想達成的目標。
        </p>
        <ConsultationField label="目標類型（選填）">
          <select
            className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base"
            value={goalType}
            onChange={(event) => setGoalType(event.target.value as ConsultationGoalType | "")}
          >
            <option value="">請選擇…</option>
            {GOAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONSULTATION_GOAL_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </ConsultationField>
        <ConsultationField label="目標體重 (kg)（選填）">
          <ConsultationInput
            inputMode="decimal"
            value={targetWeightKg}
            onChange={(event) => setTargetWeightKg(event.target.value)}
          />
        </ConsultationField>
        <ConsultationField label="目標體脂率 (%)（選填）">
          <ConsultationInput
            inputMode="decimal"
            value={targetBodyFatPercent}
            onChange={(event) => setTargetBodyFatPercent(event.target.value)}
          />
        </ConsultationField>
        <ConsultationField label="理想身材描述（選填）" hint="記下客人自己的描述，不要改寫。">
          <ConsultationTextarea
            value={desiredBodyDescription}
            onChange={(event) => setDesiredBodyDescription(event.target.value)}
            placeholder="例如：想穿回產前那條褲子、腹部不要凸出來…"
          />
        </ConsultationField>
        <ConsultationField label="目標備註（選填）">
          <ConsultationTextarea value={goalNotes} onChange={(event) => setGoalNotes(event.target.value)} />
        </ConsultationField>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading}>
            {loading ? "儲存中…" : "完成目標記錄，下一步"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
