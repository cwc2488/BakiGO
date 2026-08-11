"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateConsultationAiInsightApi,
  loadConsultationAiOutputApi,
} from "@/lib/consultation/consultation-ai-client";
import { CONSULTATION_AI_UNAVAILABLE_MESSAGE } from "@/lib/consultation/ai/constants";
import type {
  BarrierInsightOutput,
  ConsultationAiPointKey,
  MotivationInsightOutput,
} from "@/types/consultation-ai";
import type { ConsultationBarriersData, ConsultationReadinessData } from "@/types/consultation";

type RequestBody = {
  regenerate?: boolean;
  barrierDraft?: ConsultationBarriersData;
  readinessDraft?: Pick<
    ConsultationReadinessData,
    "readyIfBarrierSolved" | "notReadyReason" | "followUpNotes"
  >;
};

export function ConsultationAiInsightBlock({
  sessionId,
  pointKey,
  enabled,
  requestBody,
  requestKey,
}: {
  sessionId: string;
  pointKey: ConsultationAiPointKey;
  enabled: boolean;
  requestBody?: Omit<RequestBody, "regenerate">;
  requestKey?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRegenerate, setCanRegenerate] = useState(true);
  const [motivationOutput, setMotivationOutput] = useState<MotivationInsightOutput | null>(null);
  const [barrierOutput, setBarrierOutput] = useState<BarrierInsightOutput | null>(null);
  const inFlightRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const previousRequestKeyRef = useRef<string | undefined>(undefined);
  const requestBodyRef = useRef(requestBody);
  requestBodyRef.current = requestBody;

  const applyResponse = useCallback(
    (payload: Awaited<ReturnType<typeof generateConsultationAiInsightApi>>) => {
      setCanRegenerate(payload.canRegenerate ?? false);
      if (payload.output?.status === "completed" && payload.output.outputJson) {
        if (pointKey === "motivation_insight") {
          setMotivationOutput(payload.output.outputJson as MotivationInsightOutput);
        } else {
          setBarrierOutput(payload.output.outputJson as BarrierInsightOutput);
        }
        setError(null);
        return;
      }
      if (payload.error) {
        setError(payload.error);
      }
    },
    [pointKey],
  );

  const runGenerate = useCallback(
    async (regenerate = false) => {
      if (!enabled || inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const payload = await generateConsultationAiInsightApi(sessionId, pointKey, {
          ...requestBodyRef.current,
          regenerate,
        });
        applyResponse(payload);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : CONSULTATION_AI_UNAVAILABLE_MESSAGE);
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    [applyResponse, enabled, pointKey, sessionId],
  );

  useEffect(() => {
    if (!enabled || dismissed) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      try {
        const cached = await loadConsultationAiOutputApi(sessionId, pointKey);
        if (cancelled) {
          return;
        }
        if (cached.output?.status === "completed" && cached.output.outputJson) {
          applyResponse({ ok: true, output: cached.output, canRegenerate: true });
          return;
        }
      } catch {
        // Non-blocking — fall through to generate.
      }

      if (!cancelled) {
        bootstrappedRef.current = true;
        void runGenerate(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applyResponse, dismissed, enabled, pointKey, runGenerate, sessionId]);

  useEffect(() => {
    if (!enabled || dismissed || !requestKey || !bootstrappedRef.current) {
      return;
    }

    if (previousRequestKeyRef.current === undefined) {
      previousRequestKeyRef.current = requestKey;
      return;
    }

    if (previousRequestKeyRef.current === requestKey) {
      return;
    }

    previousRequestKeyRef.current = requestKey;

    const timer = window.setTimeout(() => {
      void runGenerate(true);
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [dismissed, enabled, requestKey, runGenerate]);

  if (!enabled || dismissed) {
    return null;
  }

  const hasContent = motivationOutput || barrierOutput;

  return (
    <section className="rounded-[1.25rem] border border-[#eadfd6] bg-white/90 p-4 ring-1 ring-[#f7efe8]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#c08a98]">
            AI 教練提示
          </p>
          <p className="mt-1 text-xs leading-5 text-[#9a8b82]">
            協助理解諮詢資料，不取代你的判斷。
          </p>
        </div>
        {loading ? (
          <span className="shrink-0 text-xs text-[#9a8b82]">分析中…</span>
        ) : null}
      </div>

      {hasContent ? (
        <div className="mt-3 space-y-3 text-sm leading-6 text-[#5f4f47]">
          {motivationOutput ? (
            <>
              <div>
                <p className="text-xs font-medium text-[#8b7d74]">核心動機</p>
                <p className="font-medium text-[#2f2622]">{motivationOutput.coreMotivation}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#8b7d74]">建議追問</p>
                <p>{motivationOutput.recommendedFollowUpQuestion}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#8b7d74]">為什麼</p>
                <p>{motivationOutput.motivationSummary}</p>
                {motivationOutput.coachNote ? (
                  <p className="mt-1 text-xs text-[#9a8b82]">{motivationOutput.coachNote}</p>
                ) : null}
              </div>
            </>
          ) : null}
          {barrierOutput ? (
            <>
              <div>
                <p className="text-xs font-medium text-[#8b7d74]">客人說出口的阻礙</p>
                <p>{barrierOutput.surfaceBarrier}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#8b7d74]">可能卡住的地方</p>
                <p>{barrierOutput.possibleUnderlyingBarrier}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#8b7d74]">建議追問</p>
                <p>{barrierOutput.recommendedQuestion}</p>
              </div>
              {barrierOutput.coachNote ? (
                <p className="text-xs text-[#9a8b82]">{barrierOutput.coachNote}</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {!hasContent && !loading && error ? (
        <p className="mt-3 text-sm text-[#9a8b82]">{error}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {canRegenerate ? (
          <button
            type="button"
            className="rounded-full bg-[#f3ebe3] px-3 py-1.5 text-xs font-medium text-[#5f4f47]"
            disabled={loading}
            onClick={() => void runGenerate(true)}
          >
            重新產生
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-full px-3 py-1.5 text-xs text-[#8b7d74]"
          onClick={() => setDismissed(true)}
        >
          繼續
        </button>
      </div>
    </section>
  );
}
