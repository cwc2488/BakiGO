"use client";

import { useMemo, useState } from "react";
import { CustomerBodyMeasurementForm } from "@/components/customers/CustomerBodyMeasurementForm";
import { parseCustomerBodyNumber } from "@/lib/customers/customer-body-form";
import {
  ConsultationFlowShell,
  ConsultationPrimaryButton,
} from "@/components/consultation/ConsultationFlowShell";
import { CONSULTATION_STEP_META } from "@/lib/consultation/consultation-flow-engine";
import { computeAgeFromCustomerProfile, computeBmi } from "@/lib/customers/body-metrics";
import { flushCustomerCloudPush } from "@/lib/cloud/customer-cloud-sync";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import { todayISODate } from "@/lib/config/app-config";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CustomerBodyFormValues } from "@/lib/customers/customer-body-form";
import type { ConsultationSessionRecord } from "@/types/consultation";

export function ConsultationStep03BodyMeasurement({
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
  const today = todayISODate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = CONSULTATION_STEP_META[3];

  async function handleSubmit(values: CustomerBodyFormValues) {
    if (!customer) {
      setError("找不到顧客資料");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const weightKg = parseCustomerBodyNumber(values.weightKg);
      const bodyRecord = repo.createBodyRecord({
        customerId: customer.id,
        recordDate: values.recordDate,
        age:
          parseCustomerBodyNumber(values.age) ??
          computeAgeFromCustomerProfile(
            { birthDate: customer.birthDate, birthYear: customer.birthYear },
            values.recordDate,
          ),
        weightKg,
        skeletalMuscleKg: parseCustomerBodyNumber(values.skeletalMuscleKg),
        bmi: parseCustomerBodyNumber(values.bmi) ?? computeBmi(weightKg, customer.heightCm ?? null),
        bodyFatPercent: parseCustomerBodyNumber(values.bodyFatPercent),
        visceralFatLevel: parseCustomerBodyNumber(values.visceralFatLevel),
        basalMetabolicRate: parseCustomerBodyNumber(values.basalMetabolicRate),
        bodyAge: parseCustomerBodyNumber(values.bodyAge),
        note: values.note.trim() || undefined,
      });

      await flushCustomerCloudPush(storage);

      const payload = await saveConsultationStepApi(sessionId, 3, {
        bodyCompositionRecordId: bodyRecord.id,
      });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法完成 Step 3");
      }
      onCompleted({ session: payload.session, data: payload.data });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法儲存量測");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConsultationFlowShell step={3} title={meta.title} purpose={meta.purpose}>
      <CustomerBodyMeasurementForm
        today={today}
        birthYear={customer?.birthYear}
        birthDate={customer?.birthDate}
        heightCm={customer?.heightCm}
        submitLabel={loading ? "儲存中…" : "儲存量測並完成 Phase 1"}
        onSubmit={(values) => void handleSubmit(values)}
        disabled={loading}
        renderSubmit={({ label, disabled }) => (
          <ConsultationPrimaryButton type="submit" disabled={disabled || loading}>
            {label}
          </ConsultationPrimaryButton>
        )}
      />
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </ConsultationFlowShell>
  );
}
