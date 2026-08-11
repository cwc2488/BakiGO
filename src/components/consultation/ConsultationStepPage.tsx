"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConsultationFlowShell, ConsultationPrimaryButton } from "@/components/consultation/ConsultationFlowShell";
import { ConsultationStep01BasicInfo } from "@/components/consultation/steps/ConsultationStep01BasicInfo";
import { ConsultationStep02HealthConcern } from "@/components/consultation/steps/ConsultationStep02HealthConcern";
import { ConsultationStep03BodyMeasurement } from "@/components/consultation/steps/ConsultationStep03BodyMeasurement";
import { isPhase1Complete, isPhase1Step } from "@/lib/consultation/consultation-flow-engine";
import { loadConsultationSessionApi } from "@/lib/consultation/consultation-client";
import type { ConsultationSessionRecord } from "@/types/consultation";

export function ConsultationStepPage({
  sessionId,
  stepNumber,
}: {
  sessionId: string;
  stepNumber: number;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<ConsultationSessionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await loadConsultationSessionApi(sessionId);
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法載入諮詢場次");
      }
      setRecord({ session: payload.session, data: payload.data });

      const activeStep = payload.session.currentStep;
      if (isPhase1Complete(activeStep) && stepNumber <= 3) {
        if (stepNumber !== 4) {
          router.replace(`/consultation/${sessionId}/step/4`);
        }
        return;
      }
      if (isPhase1Step(stepNumber) && stepNumber !== activeStep) {
        router.replace(`/consultation/${sessionId}/step/${activeStep}`);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入諮詢場次");
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [router, sessionId, stepNumber]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  function handleCompleted(next: ConsultationSessionRecord) {
    setRecord(next);
    const nextStep = next.session.currentStep;
    router.push(`/consultation/${sessionId}/step/${nextStep}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#faf6f1] text-[#8b7d74]">
        載入中…
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-[#faf6f1] px-6 text-center">
        <p className="text-sm text-red-600">{error ?? "無法載入諮詢場次"}</p>
        <Link className="mt-4 text-sm font-medium text-[#2f2622]" href="/consultation/new">
          返回開始頁
        </Link>
      </div>
    );
  }

  if (stepNumber === 4 || isPhase1Complete(record.session.currentStep)) {
    return (
      <ConsultationFlowShell
        step={3}
        title="Phase 1 已完成"
        purpose="基本資料、健康關懷與身體量測都已記錄。後續 SOP 步驟將在之後版本開放。"
      >
        <div className="space-y-4 rounded-[1.5rem] bg-white/90 p-5 ring-1 ring-[#eadfd6]">
          <p className="text-sm leading-7 text-[#6f5f57]">
            這場諮詢已保存 Step 1–3。你可以關閉頁面，下次從顧客詳情或諮詢列表繼續（Step 4 尚未開放）。
          </p>
          <p className="text-xs text-[#9a8b82]">
            Session ID：{record.session.id}
          </p>
        </div>
        <div className="mt-6 space-y-3">
          <Link href={`/customers/${record.session.customerId}`}>
            <ConsultationPrimaryButton type="button">查看顧客檔案</ConsultationPrimaryButton>
          </Link>
          <Link className="block text-center text-sm text-[#8b7d74]" href="/consultation/new">
            開始另一場諮詢
          </Link>
        </div>
      </ConsultationFlowShell>
    );
  }

  if (stepNumber === 1) {
    return (
      <ConsultationStep01BasicInfo sessionId={sessionId} record={record} onCompleted={handleCompleted} />
    );
  }
  if (stepNumber === 2) {
    return (
      <ConsultationStep02HealthConcern sessionId={sessionId} record={record} onCompleted={handleCompleted} />
    );
  }
  if (stepNumber === 3) {
    return (
      <ConsultationStep03BodyMeasurement sessionId={sessionId} record={record} onCompleted={handleCompleted} />
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[#faf6f1] px-6 text-center text-sm text-[#8b7d74]">
      此步驟尚未開放。
    </div>
  );
}
