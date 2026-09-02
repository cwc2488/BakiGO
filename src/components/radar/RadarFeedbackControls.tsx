"use client";

import { useState } from "react";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import {
  REJECTION_REASON_LABEL_ZH,
  RADAR_REJECTION_REASONS,
  type MemberRadarRecommendationFeedback,
  type RadarFeedbackValue,
  type RadarRejectionReason,
} from "@/lib/radar/feedback/types";

const QUICK_REJECTION_REASONS = RADAR_REJECTION_REASONS.filter((reason) => reason !== "other");

type Props = {
  candidateId: string;
  initial: MemberRadarRecommendationFeedback | null;
  disabled?: boolean;
};

export function RadarFeedbackControls({ candidateId, initial, disabled }: Props) {
  const [saved, setSaved] = useState<MemberRadarRecommendationFeedback | null>(initial);
  const [pickingDown, setPickingDown] = useState(false);
  const [otherNote, setOtherNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = saved?.feedback ?? null;

  const persist = async (input: {
    feedback: RadarFeedbackValue;
    rejection_reason?: RadarRejectionReason | null;
    optional_note?: string | null;
  }) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth("/api/radar/feedback", {
        method: "POST",
        body: JSON.stringify({
          candidate_id: candidateId,
          feedback: input.feedback,
          rejection_reason: input.rejection_reason ?? null,
          optional_note: input.optional_note ?? null,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        feedback?: MemberRadarRecommendationFeedback;
      };
      if (!response.ok || !body.ok || !body.feedback) {
        throw new Error(body.error ?? "評價沒有存成功");
      }
      setSaved(body.feedback);
      setPickingDown(false);
      setOtherNote("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "評價沒有存成功");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void persist({ feedback: "worth_developing" })}
          className={`flex min-h-11 items-center justify-center rounded-2xl border px-2 text-[0.8125rem] font-semibold disabled:opacity-50 ${
            selected === "worth_developing"
              ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
              : "border-[var(--brand-border)] bg-white text-[#1d1d1f]"
          }`}
        >
          👍 值得開發
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => {
            setError(null);
            setPickingDown(true);
          }}
          className={`flex min-h-11 items-center justify-center rounded-2xl border px-2 text-[0.8125rem] font-semibold disabled:opacity-50 ${
            selected === "not_worth_developing"
              ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
              : "border-[var(--brand-border)] bg-white text-[#1d1d1f]"
          }`}
        >
          👎 不值得開發
        </button>
      </div>

      {pickingDown ? (
        <div className="rounded-2xl bg-[var(--brand-bg)] p-3">
          <p className="text-[0.75rem] font-semibold text-[#86868b]">為什麼不值得開發？</p>
          <div className="mt-2 grid grid-cols-1 gap-1.5">
            {QUICK_REJECTION_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={busy}
                onClick={() =>
                  void persist({
                    feedback: "not_worth_developing",
                    rejection_reason: reason,
                  })
                }
                className="flex min-h-10 items-center rounded-xl bg-white px-3 text-left text-[0.8125rem] font-medium text-[#1d1d1f] disabled:opacity-50"
              >
                {REJECTION_REASON_LABEL_ZH[reason]}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            <p className="text-[0.75rem] font-medium text-[#636366]">
              {REJECTION_REASON_LABEL_ZH.other}
            </p>
            <input
              value={otherNote}
              onChange={(event) => setOtherNote(event.target.value)}
              maxLength={200}
              placeholder="可選填短註"
              className="min-h-10 w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 text-[0.8125rem] text-[#1d1d1f]"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void persist({
                  feedback: "not_worth_developing",
                  rejection_reason: "other",
                  optional_note: otherNote.trim() || null,
                })
              }
              className="flex min-h-10 w-full items-center justify-center rounded-xl bg-[#1d1d1f] px-3 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
            >
              送出
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPickingDown(false)}
              className="flex min-h-10 w-full items-center justify-center text-[0.75rem] text-[#86868b]"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-[0.75rem] text-[#c41e3a]">{error}</p> : null}
    </div>
  );
}
