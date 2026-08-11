"use client";

import { useState } from "react";
import {
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationPrimaryButton,
} from "@/components/consultation/ConsultationFlowShell";
import { ConsultationAiInsightBlock } from "@/components/consultation/ConsultationAiInsightBlock";
import { CONSULTATION_STEP_META } from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import { CONSULTATION_AI_POINT_KEYS } from "@/types/consultation-ai";
import type { ConsultationSessionRecord } from "@/types/consultation";

export function ConsultationStep07CommitmentScore({
  sessionId,
  record,
  onCompleted,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
  onCompleted: (next: ConsultationSessionRecord) => void;
}) {
  const initialScore = record.session.commitmentScore ?? null;
  const [score, setScore] = useState<number | null>(initialScore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = CONSULTATION_STEP_META[7];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (score === null) {
      setError("請選擇 1 到 10 的決心評分。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await saveConsultationStepApi(sessionId, 7, {
        commitmentScore: score,
      });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法儲存 Step 7");
      }
      onCompleted({ session: payload.session, data: payload.data });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法儲存 Step 7");
    } finally {
      setLoading(false);
    }
  }

  const hasMotivations = Boolean(
    record.data.dataJson.motivations?.reason1?.trim() ||
      record.data.dataJson.motivations?.reason2?.trim() ||
      record.data.dataJson.motivations?.reason3?.trim(),
  );

  return (
    <ConsultationFlowShell step={7} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
        <ConsultationAiInsightBlock
          sessionId={sessionId}
          pointKey={CONSULTATION_AI_POINT_KEYS.MOTIVATION_INSIGHT}
          enabled={hasMotivations}
        />
        <p className="rounded-[1.25rem] bg-[#f3ebe3] px-4 py-3 text-sm leading-6 text-[#6f5f57]">
          「如果 1–10 分，10 分代表你現在非常想改變，你覺得自己現在是幾分？」
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => {
            const value = index + 1;
            const selected = score === value;
            return (
              <button
                key={value}
                type="button"
                className={`aspect-square rounded-[1.25rem] text-2xl font-semibold transition active:scale-[0.98] ${
                  selected
                    ? "bg-[#2f2622] text-white ring-2 ring-[#f0a8b8]"
                    : "bg-white text-[#2f2622] ring-1 ring-[#eadfd6]"
                }`}
                onClick={() => setScore(value)}
              >
                {value}
              </button>
            );
          })}
        </div>
        {score !== null ? (
          <p className="text-center text-sm text-[#6f5f57]">
            目前選擇：<span className="font-semibold text-[#2f2622]">{score} 分</span>
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading || score === null}>
            {loading ? "儲存中…" : "確認決心評分，下一步"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
