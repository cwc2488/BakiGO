"use client";

import { useState } from "react";
import {
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationPrimaryButton,
} from "@/components/consultation/ConsultationFlowShell";
import {
  CONSULTATION_MIN_SUCCESS_STORIES,
  CONSULTATION_STEP_META,
} from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import type { ConsultationSessionRecord } from "@/types/consultation";

export function ConsultationStep09SuccessStories({
  sessionId,
  record,
  onCompleted,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
  onCompleted: (next: ConsultationSessionRecord) => void;
}) {
  const [count, setCount] = useState(record.session.successStoryCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = CONSULTATION_STEP_META[9];
  const canComplete = count >= CONSULTATION_MIN_SUCCESS_STORIES;

  async function syncAction(action: "increment" | "decrement") {
    setLoading(true);
    setError(null);
    try {
      const payload = await saveConsultationStepApi(sessionId, 9, { storyAction: action });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法更新案例數");
      }
      setCount(payload.session.successStoryCount);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "無法更新案例數");
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (!canComplete) {
      setError(`請至少分享 ${CONSULTATION_MIN_SUCCESS_STORIES} 個相近成功案例。`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await saveConsultationStepApi(sessionId, 9, { storyAction: "complete" });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法完成 Step 9");
      }
      onCompleted({ session: payload.session, data: payload.data });
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "無法完成 Step 9");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConsultationFlowShell step={9} title={meta.title} purpose={meta.purpose}>
      <div className="space-y-4">
        <p className="rounded-[1.25rem] bg-[#f3ebe3] px-4 py-3 text-sm leading-6 text-[#6f5f57]">
          現在請分享至少 3 個與他相近的成功案例。夥伴自行展示手上的照片／故事，V1 不需上傳或選資料庫。
        </p>
        <div className="rounded-[1.5rem] bg-white/90 p-6 text-center ring-1 ring-[#eadfd6]">
          <p className="text-sm text-[#8b7d74]">已分享案例</p>
          <p className="mt-2 text-4xl font-semibold text-[#2f2622]">
            {count} <span className="text-lg font-normal text-[#8b7d74]">/ {CONSULTATION_MIN_SUCCESS_STORIES}+</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={loading || count <= 0}
            className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-medium text-[#6f5f57] ring-1 ring-[#eadfd6] disabled:opacity-50"
            onClick={() => void syncAction("decrement")}
          >
            − 修正誤按
          </button>
          <button
            type="button"
            disabled={loading}
            className="rounded-[1.25rem] bg-[#2f2622] px-4 py-4 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void syncAction("increment")}
          >
            + 已分享一個案例
          </button>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="button" disabled={loading || !canComplete} onClick={() => void handleComplete()}>
            {loading ? "儲存中…" : canComplete ? "完成案例分享，下一步" : `還需 ${CONSULTATION_MIN_SUCCESS_STORIES - count} 個案例`}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </div>
    </ConsultationFlowShell>
  );
}
