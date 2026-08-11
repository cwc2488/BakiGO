"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConsultationFlowProvider } from "@/components/consultation/ConsultationFlowContext";
import { ConsultationFlowShell, ConsultationPrimaryButton } from "@/components/consultation/ConsultationFlowShell";
import { ConsultationStep01BasicInfo } from "@/components/consultation/steps/ConsultationStep01BasicInfo";
import { ConsultationStep02HealthConcern } from "@/components/consultation/steps/ConsultationStep02HealthConcern";
import { ConsultationStep03BodyMeasurement } from "@/components/consultation/steps/ConsultationStep03BodyMeasurement";
import { ConsultationStep04DataReviewGoals } from "@/components/consultation/steps/ConsultationStep04DataReviewGoals";
import { ConsultationStep05PreviousExperience } from "@/components/consultation/steps/ConsultationStep05PreviousExperience";
import { ConsultationStep06Motivations } from "@/components/consultation/steps/ConsultationStep06Motivations";
import { ConsultationStep07CommitmentScore } from "@/components/consultation/steps/ConsultationStep07CommitmentScore";
import { ConsultationStep08CommitmentGate } from "@/components/consultation/steps/ConsultationStep08CommitmentGate";
import { isValidConsultationStep } from "@/lib/consultation/consultation-flow-engine";
import { loadConsultationSessionApi, type ConsultationSessionPayload } from "@/lib/consultation/consultation-client";
import {
  consultationSessionCacheCoversStep,
  getConsultationSessionCache,
  setConsultationSessionCache,
} from "@/lib/consultation/consultation-session-cache";
import { consultationStepPath, prefetchConsultationSteps } from "@/lib/consultation/consultation-step-navigation";
import { CONSULTATION_PHASE2_MAX_STEP, type ConsultationSessionRecord } from "@/types/consultation";

function ConsultationPausedScreen({ record }: { record: ConsultationSessionRecord }) {
  const readiness = record.data.dataJson.readiness;
  return (
    <ConsultationFlowShell
      step={8}
      title="本次諮詢暫停"
      purpose="客人目前尚未準備好進入正式方案流程。前面所有資料都已保留。"
    >
      <div className="space-y-4 rounded-[1.5rem] bg-white/90 p-5 ring-1 ring-[#eadfd6]">
        <p className="text-sm leading-7 text-[#6f5f57]">
          狀態：<span className="font-medium text-[#2f2622]">not_ready</span>
          {record.session.commitmentScore !== undefined
            ? ` · 決心 ${record.session.commitmentScore} 分`
            : ""}
        </p>
        {readiness?.notReadyReason ? (
          <p className="text-sm leading-7 text-[#6f5f57]">原因：{readiness.notReadyReason}</p>
        ) : null}
        {readiness?.followUpNotes ? (
          <p className="text-sm leading-7 text-[#6f5f57]">追蹤備註：{readiness.followUpNotes}</p>
        ) : null}
        {readiness?.followUpDate ? (
          <p className="text-sm leading-7 text-[#6f5f57]">追蹤日期：{readiness.followUpDate}</p>
        ) : null}
        <p className="text-xs text-[#9a8b82]">Step 9 之後的 SOP 尚未開放，且 not_ready 狀態無法直接進入。</p>
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

function ConsultationPhase2GateCompleteScreen({ record }: { record: ConsultationSessionRecord }) {
  return (
    <ConsultationFlowShell
      step={8}
      title="Decision Tree 已完成"
      purpose="目標、過往經驗、理由、決心與準備度都已記錄。Step 9 之後的 SOP 將在後續 Phase 開放。"
    >
      <div className="space-y-4 rounded-[1.5rem] bg-white/90 p-5 ring-1 ring-[#eadfd6]">
        <p className="text-sm leading-7 text-[#6f5f57]">
          準備度判定：
          <span className="font-medium text-[#2f2622]">
            {record.data.dataJson.readiness?.gateDecision === "ready" ? "ready" : "—"}
          </span>
          {record.session.commitmentScore !== undefined
            ? ` · 決心 ${record.session.commitmentScore} 分`
            : ""}
        </p>
        <p className="text-xs text-[#9a8b82]">Session ID：{record.session.id}</p>
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

function applySessionRouting(
  payload: ConsultationSessionRecord,
  stepNumber: number,
  router: ReturnType<typeof useRouter>,
): boolean {
  const activeStep = payload.session.currentStep;

  if (!isValidConsultationStep(stepNumber)) {
    router.replace(consultationStepPath(payload.session.id, activeStep));
    return false;
  }

  if (payload.session.status === "not_ready" && stepNumber > CONSULTATION_PHASE2_MAX_STEP) {
    router.replace(consultationStepPath(payload.session.id, CONSULTATION_PHASE2_MAX_STEP));
    return false;
  }

  if (stepNumber > activeStep) {
    router.replace(consultationStepPath(payload.session.id, activeStep));
    return false;
  }

  return true;
}

export function ConsultationStepPage({
  sessionId,
  stepNumber,
}: {
  sessionId: string;
  stepNumber: number;
}) {
  const router = useRouter();
  const cachedOnMount = getConsultationSessionCache(sessionId);
  const [record, setRecord] = useState<ConsultationSessionRecord | null>(
    cachedOnMount && consultationSessionCacheCoversStep(cachedOnMount, stepNumber) ? cachedOnMount : null,
  );
  const [loading, setLoading] = useState(() => record === null);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadSession = useCallback(
    async (options?: { background?: boolean }) => {
      const cached = getConsultationSessionCache(sessionId);
      const cacheHit = cached && consultationSessionCacheCoversStep(cached, stepNumber);

      if (cacheHit && !options?.background) {
        setRecord(cached);
        setLoading(false);
        applySessionRouting(cached, stepNumber, router);
        return;
      }

      if (!options?.background && !cacheHit) {
        setLoading(true);
      }
      setError(null);

      try {
        const payload = await loadConsultationSessionApi(sessionId);
        if (!payload.session || !payload.data) {
          throw new Error(payload.error ?? "無法載入諮詢場次");
        }

        const nextRecord = { session: payload.session, data: payload.data };
        setConsultationSessionCache(sessionId, nextRecord);
        setRecord(nextRecord);
        applySessionRouting(nextRecord, stepNumber, router);
      } catch (loadError) {
        if (!cacheHit) {
          setError(loadError instanceof Error ? loadError.message : "無法載入諮詢場次");
          setRecord(null);
        }
      } finally {
        if (!options?.background) {
          setLoading(false);
        }
      }
    },
    [router, sessionId, stepNumber],
  );

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!record) {
      return;
    }
    const upcoming = [stepNumber + 1, stepNumber + 2].filter((step) => step <= 14);
    prefetchConsultationSteps(router.prefetch.bind(router), sessionId, upcoming);
  }, [record, router, sessionId, stepNumber]);

  const completeBlocking = useCallback(
    (next: ConsultationSessionRecord) => {
      setConsultationSessionCache(sessionId, next);
      setRecord(next);
      setSyncError(null);
      router.push(consultationStepPath(sessionId, next.session.currentStep));
    },
    [router, sessionId],
  );

  const completeOptimistic = useCallback(
    (input: {
      stepNumber: number;
      priorRecord: ConsultationSessionRecord;
      optimisticRecord: ConsultationSessionRecord;
      savePromise: Promise<ConsultationSessionPayload>;
    }) => {
      setConsultationSessionCache(sessionId, input.optimisticRecord);
      setRecord(input.optimisticRecord);
      setSyncError(null);
      router.push(consultationStepPath(sessionId, input.optimisticRecord.session.currentStep));

      void input.savePromise
        .then((payload) => {
          if (!payload.session || !payload.data) {
            throw new Error(payload.error ?? "無法儲存諮詢步驟");
          }
          const confirmed = { session: payload.session, data: payload.data };
          setConsultationSessionCache(sessionId, confirmed);
          setRecord((current) => (current?.session.id === sessionId ? confirmed : current));
        })
        .catch((saveError) => {
          setConsultationSessionCache(sessionId, input.priorRecord);
          setRecord(input.priorRecord);
          setSyncError(saveError instanceof Error ? saveError.message : "儲存失敗，請重試");
          router.replace(consultationStepPath(sessionId, input.stepNumber));
        });
    },
    [router, sessionId],
  );

  const flowActions = useMemo(
    () => ({
      syncError,
      clearSyncError: () => setSyncError(null),
      completeBlocking,
      completeOptimistic,
    }),
    [completeBlocking, completeOptimistic, syncError],
  );

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

  if (record.session.status === "not_ready") {
    return <ConsultationPausedScreen record={record} />;
  }

  if (record.session.currentStep >= 9 && stepNumber >= 9) {
    return <ConsultationPhase2GateCompleteScreen record={record} />;
  }

  const stepContent = (() => {
    if (stepNumber === 1) {
      return <ConsultationStep01BasicInfo sessionId={sessionId} record={record} onCompleted={completeBlocking} />;
    }
    if (stepNumber === 2) {
      return <ConsultationStep02HealthConcern sessionId={sessionId} record={record} onCompleted={completeBlocking} />;
    }
    if (stepNumber === 3) {
      return (
        <ConsultationStep03BodyMeasurement sessionId={sessionId} record={record} onCompleted={completeBlocking} />
      );
    }
    if (stepNumber === 4) {
      return <ConsultationStep04DataReviewGoals sessionId={sessionId} record={record} />;
    }
    if (stepNumber === 5) {
      return <ConsultationStep05PreviousExperience sessionId={sessionId} record={record} />;
    }
    if (stepNumber === 6) {
      return <ConsultationStep06Motivations sessionId={sessionId} record={record} />;
    }
    if (stepNumber === 7) {
      return <ConsultationStep07CommitmentScore sessionId={sessionId} record={record} onCompleted={completeBlocking} />;
    }
    if (stepNumber === 8) {
      return <ConsultationStep08CommitmentGate sessionId={sessionId} record={record} onCompleted={completeBlocking} />;
    }
    return (
      <div className="flex min-h-full items-center justify-center bg-[#faf6f1] px-6 text-center text-sm text-[#8b7d74]">
        此步驟尚未開放。
      </div>
    );
  })();

  return (
    <ConsultationFlowProvider value={flowActions}>
      {syncError ? (
        <div className="bg-[#fff3f0] px-4 py-3 text-center text-sm text-[#b04a3a]">{syncError}</div>
      ) : null}
      {stepContent}
    </ConsultationFlowProvider>
  );
}
