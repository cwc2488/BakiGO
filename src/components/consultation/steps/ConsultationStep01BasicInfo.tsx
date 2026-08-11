"use client";

import { useMemo, useState } from "react";
import {
  ConsultationField,
  ConsultationFlowShell,
  ConsultationInput,
  ConsultationPrimaryButton,
} from "@/components/consultation/ConsultationFlowShell";
import { CONSULTATION_STEP_META } from "@/lib/consultation/consultation-flow-engine";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { flushCustomerCloudPush } from "@/lib/cloud/customer-cloud-sync";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import type { ConsultationSessionRecord } from "@/types/consultation";

export function ConsultationStep01BasicInfo({
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

  const [displayName, setDisplayName] = useState(customer?.displayName ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [birthDate, setBirthDate] = useState(customer?.birthDate ?? "");
  const [heightCm, setHeightCm] = useState(customer?.heightCm ? String(customer.heightCm) : "");
  const [region, setRegion] = useState(customer?.region ?? "");
  const [occupation, setOccupation] = useState(customer?.occupation ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = CONSULTATION_STEP_META[1];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!customer) {
      setError("找不到顧客資料");
      return;
    }
    if (!displayName.trim()) {
      setError("請輸入姓名");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const parsedHeight = heightCm.trim() ? Number(heightCm) : undefined;

      repo.updateCustomer(customer.id, {
        displayName: displayName.trim(),
        phone: phone.trim() || undefined,
        birthDate: birthDate.trim() || undefined,
        heightCm: Number.isFinite(parsedHeight) ? parsedHeight : undefined,
        region: region.trim() || undefined,
        occupation: occupation.trim() || undefined,
      });

      await flushCustomerCloudPush(storage);

      const payload = await saveConsultationStepApi(sessionId, 1, {});
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法儲存 Step 1");
      }
      onCompleted({ session: payload.session, data: payload.data });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法儲存 Step 1");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConsultationFlowShell step={1} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <ConsultationField label="姓名（必填）">
          <ConsultationInput
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </ConsultationField>
        <ConsultationField label="電話">
          <ConsultationInput
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </ConsultationField>
        <ConsultationField label="出生年月日" hint="完整生日會寫入顧客檔案，量測時可更精準推算年齡。">
          <ConsultationInput
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </ConsultationField>
        <ConsultationField label="身高 (cm)" hint="設定後量測時 BMI 可自動計算。">
          <ConsultationInput
            inputMode="decimal"
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
            placeholder="例如：165"
          />
        </ConsultationField>
        <ConsultationField label="地區">
          <ConsultationInput value={region} onChange={(event) => setRegion(event.target.value)} />
        </ConsultationField>
        <ConsultationField label="工作">
          <ConsultationInput
            value={occupation}
            onChange={(event) => setOccupation(event.target.value)}
          />
        </ConsultationField>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationPrimaryButton type="submit" disabled={loading}>
          {loading ? "儲存中…" : "確認基本資料，下一步"}
        </ConsultationPrimaryButton>
      </form>
    </ConsultationFlowShell>
  );
}
