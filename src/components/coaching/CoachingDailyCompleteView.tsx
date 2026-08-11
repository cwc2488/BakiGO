"use client";

import { useEffect, useState } from "react";
import { CrmButton, CrmCard } from "@/components/members/ui";
import { countPrimaryMealsDone, isMealReported } from "@/lib/coaching/coaching-completion";
import { formatSleepTimeRange } from "@/lib/coaching/coaching-sleep";
import {
  COACHING_AI_CUSTOMER_POLL_TIMEOUT_MS,
  type CoachingDailyGenerationCustomerOutput,
} from "@/types/coaching-ai";
import {
  COACHING_MEAL_SLOT_LABELS,
  PRIMARY_MEAL_SLOTS,
  type CoachingDailyLogDetail,
  type CoachingMealSlot,
} from "@/types/coaching";

type MealDraft = {
  textNote: string;
  previewUrl: string | null;
};

type AiPollState = "analyzing" | "ready" | "unavailable";

export function CoachingDailyCompleteView({
  dailyLog,
  mealDrafts,
  logDate,
  portalToken,
  onEdit,
}: {
  dailyLog: CoachingDailyLogDetail;
  mealDrafts: Record<CoachingMealSlot, MealDraft>;
  logDate: string;
  portalToken: string;
  onEdit: () => void;
}) {
  const mealsFromLog = dailyLog.meals;
  const primaryDone = countPrimaryMealsDone(mealsFromLog);

  const mealSummary = PRIMARY_MEAL_SLOTS.map((slot) => {
    const meal = mealsFromLog.find((entry) => entry.mealSlot === slot);
    const draft = mealDrafts[slot];
    const reported = isMealReported(meal) || Boolean(draft.previewUrl) || Boolean(draft.textNote.trim());
    return {
      slot,
      label: COACHING_MEAL_SLOT_LABELS[slot],
      reported,
    };
  });

  const sleepRange =
    dailyLog.sleepBedtime && dailyLog.sleepWakeTime
      ? formatSleepTimeRange(dailyLog.sleepBedtime, dailyLog.sleepWakeTime)
      : null;

  const [aiState, setAiState] = useState<AiPollState>("analyzing");
  const [customerFeedback, setCustomerFeedback] = useState<CoachingDailyGenerationCustomerOutput | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/coaching/portal/${encodeURIComponent(portalToken)}/ai-output?logDate=${encodeURIComponent(logDate)}`,
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          aiOutput?: {
            status: string;
            customer: CoachingDailyGenerationCustomerOutput | null;
          };
        };

        if (cancelled) return;

        if (response.ok && payload.ok && payload.aiOutput) {
          if (payload.aiOutput.status === "completed" && payload.aiOutput.customer) {
            setCustomerFeedback(payload.aiOutput.customer);
            setAiState("ready");
            return;
          }
          if (payload.aiOutput.status === "failed") {
            setAiState("unavailable");
            return;
          }
        }
      } catch {
        // Keep polling until timeout — submit already succeeded.
      }

      if (cancelled) return;

      if (Date.now() - startedAt >= COACHING_AI_CUSTOMER_POLL_TIMEOUT_MS) {
        setAiState("unavailable");
        return;
      }

      timer = setTimeout(() => {
        void poll();
      }, 2500);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [portalToken, logDate]);

  return (
    <div className="space-y-4">
      <CrmCard className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-bg)] text-[1.5rem]">
          ✓
        </div>
        <div className="space-y-1">
          <h2 className="text-[1.375rem] font-semibold text-[#1d1d1f]">今日回報完成</h2>
          <p className="text-[0.9375rem] text-[#636366]">{logDate} · 謝謝你今天的紀錄</p>
        </div>
      </CrmCard>

      <CrmCard className="space-y-4">
        <h3 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">今日濃縮摘要</h3>
        <dl className="space-y-3 text-[0.9375rem]">
          <SummaryRow
            label="主要三餐"
            value={`${primaryDone}/3${mealSummary.every((item) => item.reported) ? " · 完成" : ""}`}
          />
          {mealSummary.map((item) => (
            <SummaryRow
              key={item.slot}
              compact
              label={item.label}
              value={item.reported ? "已回報" : "—"}
            />
          ))}
          <SummaryRow label="水分" value={dailyLog.waterMl != null ? `${dailyLog.waterMl} ml` : "—"} />
          <SummaryRow
            label="睡眠"
            value={
              dailyLog.sleepDuration
                ? sleepRange
                  ? `${dailyLog.sleepDuration} (${sleepRange})`
                  : dailyLog.sleepDuration
                : "—"
            }
          />
          <SummaryRow label="運動" value={dailyLog.exerciseNote?.trim() ? dailyLog.exerciseNote : "—"} />
          <SummaryRow
            label="排便"
            value={dailyLog.bowelMovementCount != null ? `${dailyLog.bowelMovementCount} 次` : "—"}
          />
        </dl>
      </CrmCard>

      <CrmCard className="space-y-3">
        <h3 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">教練回饋</h3>
        {aiState === "analyzing" ? (
          <p className="rounded-[1rem] bg-[#fafafa] px-4 py-5 text-[0.9375rem] leading-relaxed text-[#636366]">
            正在分析今日回報…
          </p>
        ) : null}
        {aiState === "unavailable" ? (
          <p className="rounded-[1rem] bg-[#fafafa] px-4 py-5 text-[0.9375rem] leading-relaxed text-[#636366]">
            今天的回報已成功送出，教練回饋暫時無法生成。
          </p>
        ) : null}
        {aiState === "ready" && customerFeedback ? (
          <div className="space-y-3 text-left text-[0.9375rem] leading-relaxed text-[#1d1d1f]">
            <p>{customerFeedback.encouragement}</p>
            <p className="text-[#636366]">{customerFeedback.today_feedback}</p>
            {customerFeedback.adjustment_priorities.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[0.8125rem] font-medium text-[#86868b]">今日調整優先</p>
                <ul className="list-disc space-y-1 pl-5">
                  {customerFeedback.adjustment_priorities.slice(0, 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="rounded-[1rem] bg-[var(--brand-bg)] px-4 py-3">
              <p className="text-[0.8125rem] font-medium text-[#86868b]">明日焦點</p>
              <p className="mt-1">{customerFeedback.tomorrow_focus}</p>
            </div>
          </div>
        ) : null}
      </CrmCard>

      <CrmButton onClick={onEdit} type="button" variant="secondary">
        修改今日回報
      </CrmButton>

      {dailyLog.submittedAt ? (
        <p className="text-center text-[0.8125rem] text-[#86868b]">
          送出時間：{new Date(dailyLog.submittedAt).toLocaleString("zh-TW")}
        </p>
      ) : null}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${compact ? "pl-3 text-[0.875rem]" : ""}`}>
      <dt className={`font-medium ${compact ? "text-[#86868b]" : "text-[#636366]"}`}>{label}</dt>
      <dd className="text-right text-[#1d1d1f]">{value}</dd>
    </div>
  );
}
