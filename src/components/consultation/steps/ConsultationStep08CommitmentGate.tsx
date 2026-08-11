"use client";

import { useMemo, useState } from "react";
import { ConsultationAiInsightBlock } from "@/components/consultation/ConsultationAiInsightBlock";
import {
  ConsultationField,
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationInput,
  ConsultationPrimaryButton,
  ConsultationTextarea,
} from "@/components/consultation/ConsultationFlowShell";
import {
  CONSULTATION_BARRIER_LABELS,
  CONSULTATION_STEP_META,
  getStep8Mode,
} from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import {
  CONSULTATION_BARRIER_KEYS,
  type ConsultationBarrierKey,
  type ConsultationSessionRecord,
} from "@/types/consultation";
import { CONSULTATION_AI_POINT_KEYS } from "@/types/consultation-ai";

export function ConsultationStep08CommitmentGate({
  sessionId,
  record,
  onCompleted,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
  onCompleted: (next: ConsultationSessionRecord) => void;
}) {
  const commitmentScore = record.session.commitmentScore ?? 0;
  const mode = getStep8Mode(commitmentScore);
  const initialBarriers = record.data.dataJson.barriers ?? {};
  const initialReadiness = record.data.dataJson.readiness ?? {};

  const [selectedBarriers, setSelectedBarriers] = useState<ConsultationBarrierKey[]>(
    initialBarriers.barriers ?? [],
  );
  const [primaryBarrier, setPrimaryBarrier] = useState<ConsultationBarrierKey | "">(
    initialBarriers.primaryBarrier ?? "",
  );
  const [barrierNotes, setBarrierNotes] = useState(initialBarriers.barrierNotes ?? "");
  const [potentialBarriers, setPotentialBarriers] = useState<ConsultationBarrierKey[]>(
    initialBarriers.potentialBarriers ?? [],
  );
  const [potentialBarrierNotes, setPotentialBarrierNotes] = useState(
    initialBarriers.potentialBarrierNotes ?? "",
  );
  const [readyIfBarrierSolved, setReadyIfBarrierSolved] = useState<boolean | null>(
    initialReadiness.readyIfBarrierSolved ?? null,
  );
  const [notReadyReason, setNotReadyReason] = useState(initialReadiness.notReadyReason ?? "");
  const [followUpNotes, setFollowUpNotes] = useState(initialReadiness.followUpNotes ?? "");
  const [followUpDate, setFollowUpDate] = useState(initialReadiness.followUpDate ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = useMemo(() => {
    if (mode === "execution_confirm") {
      return {
        ...CONSULTATION_STEP_META[8],
        title: "確認執行條件",
        purpose: "既然決心已達 10 分，確認接下來執行時有沒有可能影響計畫的因素。",
      };
    }
    if (mode === "not_ready_confirm") {
      return {
        ...CONSULTATION_STEP_META[8],
        title: "目前還沒準備好",
        purpose: "目前改變的意願還沒有到適合開始正式方案的程度。請與客人確認並記錄後續安排。",
      };
    }
    return CONSULTATION_STEP_META[8];
  }, [mode]);

  function toggleBarrier(key: ConsultationBarrierKey) {
    setSelectedBarriers((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      if (primaryBarrier && !next.includes(primaryBarrier as ConsultationBarrierKey)) {
        setPrimaryBarrier("");
      }
      return next;
    });
  }

  function togglePotentialBarrier(key: ConsultationBarrierKey) {
    setPotentialBarriers((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "barrier_explore" && readyIfBarrierSolved === null) {
      setError("請確認：若阻礙有辦法解決，客人是否願意認真開始。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await saveConsultationStepApi(sessionId, 8, {
        barriers: {
          barriers: mode === "barrier_explore" ? selectedBarriers : undefined,
          primaryBarrier:
            mode === "barrier_explore" && primaryBarrier ? primaryBarrier : undefined,
          barrierNotes: mode === "barrier_explore" ? barrierNotes.trim() || undefined : undefined,
          potentialBarriers: mode === "execution_confirm" ? potentialBarriers : undefined,
          potentialBarrierNotes:
            mode === "execution_confirm" ? potentialBarrierNotes.trim() || undefined : undefined,
        },
        readiness: {
          readyIfBarrierSolved:
            mode === "barrier_explore" && readyIfBarrierSolved !== null
              ? readyIfBarrierSolved
              : undefined,
          notReadyReason:
            mode === "not_ready_confirm" ? notReadyReason.trim() || undefined : undefined,
          followUpNotes: followUpNotes.trim() || undefined,
          followUpDate: followUpDate.trim() || undefined,
        },
      });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法完成 Step 8");
      }
      onCompleted({ session: payload.session, data: payload.data });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法完成 Step 8");
    } finally {
      setLoading(false);
    }
  }

  const barrierDraft = useMemo(
    () => ({
      barriers: selectedBarriers,
      primaryBarrier: primaryBarrier || undefined,
      barrierNotes: barrierNotes.trim() || undefined,
    }),
    [barrierNotes, primaryBarrier, selectedBarriers],
  );
  const readinessDraft = useMemo(
    () => ({
      readyIfBarrierSolved: readyIfBarrierSolved ?? undefined,
      followUpNotes: followUpNotes.trim() || undefined,
    }),
    [followUpNotes, readyIfBarrierSolved],
  );
  const barrierInsightKey = `${selectedBarriers.join(",")}|${barrierNotes}|${readyIfBarrierSolved ?? ""}`;

  return (
    <ConsultationFlowShell step={8} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        {mode === "barrier_explore" ? (
          <>
            <ConsultationAiInsightBlock
              sessionId={sessionId}
              pointKey={CONSULTATION_AI_POINT_KEYS.BARRIER_INSIGHT}
              enabled
              requestBody={{ barrierDraft, readinessDraft }}
              requestKey={barrierInsightKey}
            />
            <p className="rounded-[1.25rem] bg-[#f3ebe3] px-4 py-3 text-sm leading-6 text-[#6f5f57]">
              你現在是 {commitmentScore} 分，那少掉的這幾分主要是卡在哪裡？
            </p>
            <div className="flex flex-wrap gap-2">
              {CONSULTATION_BARRIER_KEYS.map((key) => {
                const active = selectedBarriers.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`rounded-full px-3 py-2 text-sm ${
                      active
                        ? "bg-[#2f2622] text-white"
                        : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
                    }`}
                    onClick={() => toggleBarrier(key)}
                  >
                    {CONSULTATION_BARRIER_LABELS[key]}
                  </button>
                );
              })}
            </div>
            {selectedBarriers.length > 0 ? (
              <ConsultationField label="主要阻礙（選填）">
                <select
                  className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base"
                  value={primaryBarrier}
                  onChange={(event) =>
                    setPrimaryBarrier(event.target.value as ConsultationBarrierKey | "")
                  }
                >
                  <option value="">請選擇…</option>
                  {selectedBarriers.map((key) => (
                    <option key={key} value={key}>
                      {CONSULTATION_BARRIER_LABELS[key]}
                    </option>
                  ))}
                </select>
              </ConsultationField>
            ) : null}
            <ConsultationField label="阻礙備註（選填）">
              <ConsultationTextarea value={barrierNotes} onChange={(event) => setBarrierNotes(event.target.value)} />
            </ConsultationField>
            <p className="text-sm font-medium text-[#5f4f47]">
              如果這個問題有辦法解決，你願不願意認真開始？
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-full px-4 py-3 text-sm font-medium ${
                  readyIfBarrierSolved === true
                    ? "bg-[#2f2622] text-white"
                    : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
                }`}
                onClick={() => setReadyIfBarrierSolved(true)}
              >
                願意
              </button>
              <button
                type="button"
                className={`flex-1 rounded-full px-4 py-3 text-sm font-medium ${
                  readyIfBarrierSolved === false
                    ? "bg-[#2f2622] text-white"
                    : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
                }`}
                onClick={() => setReadyIfBarrierSolved(false)}
              >
                還不願意
              </button>
            </div>
          </>
        ) : null}

        {mode === "execution_confirm" ? (
          <>
            <p className="rounded-[1.25rem] bg-[#f3ebe3] px-4 py-3 text-sm leading-6 text-[#6f5f57]">
              既然你現在是 10 分，我們確認一下接下來執行時，有沒有什麼事情可能影響你？
            </p>
            <div className="flex flex-wrap gap-2">
              {CONSULTATION_BARRIER_KEYS.map((key) => {
                const active = potentialBarriers.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`rounded-full px-3 py-2 text-sm ${
                      active
                        ? "bg-[#2f2622] text-white"
                        : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
                    }`}
                    onClick={() => togglePotentialBarrier(key)}
                  >
                    {CONSULTATION_BARRIER_LABELS[key]}
                  </button>
                );
              })}
            </div>
            <ConsultationField label="可能影響因素備註（選填）">
              <ConsultationTextarea
                value={potentialBarrierNotes}
                onChange={(event) => setPotentialBarrierNotes(event.target.value)}
              />
            </ConsultationField>
          </>
        ) : null}

        {mode === "not_ready_confirm" ? (
          <>
            <p className="rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-sm leading-6 text-[#6f5f57]">
              目前改變的意願還沒有到適合開始正式方案的程度。請與客人確認，並記錄後續追蹤方式。
            </p>
            <ConsultationField label="尚未準備好的原因（必填）">
              <ConsultationTextarea
                value={notReadyReason}
                onChange={(event) => setNotReadyReason(event.target.value)}
              />
            </ConsultationField>
          </>
        ) : null}

        {(mode === "not_ready_confirm" || mode === "barrier_explore") && (
          <>
            <ConsultationField label="追蹤備註（選填）">
              <ConsultationTextarea
                value={followUpNotes}
                onChange={(event) => setFollowUpNotes(event.target.value)}
              />
            </ConsultationField>
            <ConsultationField label="追蹤日期（選填）">
              <ConsultationInput
                type="date"
                value={followUpDate}
                onChange={(event) => setFollowUpDate(event.target.value)}
              />
            </ConsultationField>
          </>
        )}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton
            type="submit"
            disabled={loading || (mode === "barrier_explore" && readyIfBarrierSolved === null)}
          >
            {loading
              ? "處理中…"
              : mode === "execution_confirm"
                ? "確認執行條件，進入下一步"
                : mode === "barrier_explore"
                  ? "完成阻礙探索"
                  : "確認暫停諮詢"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
