"use client";

import { useEffect, useState } from "react";
import { CrmButton, CrmCard } from "@/components/members/ui";
import { countPrimaryMealsDone, isMealReported } from "@/lib/coaching/coaching-completion";
import { formatSleepTimeRange } from "@/lib/coaching/coaching-sleep";
import {
  nextCoachingAiPollIntervalMs,
} from "@/lib/coaching/ai/coaching-ai-latency";
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
  dayLabel,
  portalToken,
  onEdit,
  continueBackfillLabel,
  onContinueBackfill,
  onOpenHistory,
  showImmediateReceived = false,
}: {
  dailyLog: CoachingDailyLogDetail;
  mealDrafts: Record<CoachingMealSlot, MealDraft>;
  logDate: string;
  dayLabel: string;
  portalToken: string;
  onEdit: () => void;
  continueBackfillLabel?: string | null;
  onContinueBackfill?: () => void;
  onOpenHistory?: () => void;
  /** Right after submit — emphasize receipt; AI poll continues in background. */
  showImmediateReceived?: boolean;
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
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (aiState !== "analyzing") return;
    const tick = window.setInterval(() => {
      setElapsedSec((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [aiState]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

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

      const delay = nextCoachingAiPollIntervalMs(attempt);
      attempt += 1;
      timer = setTimeout(() => {
        void poll();
      }, delay);
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
          <h2 className="text-[1.375rem] font-semibold text-[#1d1d1f]">
            {showImmediateReceived || aiState === "analyzing"
              ? "今天的回報收到囉 ✓"
              : `${dayLabel}回報完成`}
          </h2>
          <p className="text-[0.9375rem] text-[#636366]">
            {aiState === "analyzing"
              ? "AI 正在幫你整理，完成後這裡會自動更新。"
              : aiState === "ready"
                ? `${logDate} · 教練回饋已就緒`
                : `${logDate} · 謝謝你這天的紀錄`}
          </p>
        </div>
        {aiState === "analyzing" ? (
          <ol className="mx-auto grid max-w-sm gap-2 text-left text-[0.875rem] text-[#636366]">
            <ProgressStep done label="回報已收到" />
            <ProgressStep active label="AI 正在整理今日內容" hint={elapsedSec > 0 ? `${elapsedSec}s` : undefined} />
            <ProgressStep label="回饋完成後自動更新" />
          </ol>
        ) : null}
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
            今天的回報收到囉 ✓ AI 正在幫你整理，完成後這裡會自動更新。
          </p>
        ) : null}
        {aiState === "unavailable" ? (
          <p className="rounded-[1rem] bg-[#fafafa] px-4 py-5 text-[0.9375rem] leading-relaxed text-[#636366]">
            今天的回報已成功送出。教練回饋還在準備中或暫時無法生成；稍後回來打開這頁，完成後會自動顯示。
          </p>
        ) : null}
        {aiState === "ready" && customerFeedback ? (
          <div className="space-y-4 text-left text-[0.9375rem] leading-relaxed text-[#1d1d1f]">
            <p>{customerFeedback.encouragement}</p>
            {customerFeedback.customer_voice_response ? (
              <p className="rounded-[1rem] bg-[#f7faf5] px-4 py-3 text-[#1d1d1f]">
                {customerFeedback.customer_voice_response}
              </p>
            ) : null}
            <div className="space-y-1">
              <p className="text-[0.8125rem] font-medium text-[#86868b]">今天飲食總評</p>
              <p className="text-[#636366]">{customerFeedback.daily_food_summary}</p>
            </div>
            <div className="space-y-2">
              {(["breakfast", "lunch", "dinner"] as const).map((slot) => {
                const meal = customerFeedback.meal_feedback?.[slot];
                if (!meal) return null;
                const label = slot === "breakfast" ? "早餐" : slot === "lunch" ? "午餐" : "晚餐";
                return (
                  <div key={slot} className="rounded-[1rem] border border-[#eef2ea] px-3 py-3">
                    <p className="font-medium text-[#1d1d1f]">{label}</p>
                    <p className="mt-1 text-[#636366]">{meal.summary}</p>
                    {meal.adjustment ? <p className="mt-1 text-[#636366]">調整：{meal.adjustment}</p> : null}
                    {meal.follow_up_question ? (
                      <p className="mt-1 text-[#86868b]">想確認：{meal.follow_up_question}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {(customerFeedback.lifestyle_feedback?.hydration ||
              customerFeedback.lifestyle_feedback?.sleep ||
              customerFeedback.lifestyle_feedback?.exercise) && (
              <div className="space-y-1">
                <p className="text-[0.8125rem] font-medium text-[#86868b]">生活作息</p>
                {customerFeedback.lifestyle_feedback.hydration ? (
                  <p className="text-[#636366]">水分：{customerFeedback.lifestyle_feedback.hydration}</p>
                ) : null}
                {customerFeedback.lifestyle_feedback.sleep ? (
                  <p className="text-[#636366]">睡眠：{customerFeedback.lifestyle_feedback.sleep}</p>
                ) : null}
                {customerFeedback.lifestyle_feedback.exercise ? (
                  <p className="text-[#636366]">運動：{customerFeedback.lifestyle_feedback.exercise}</p>
                ) : null}
              </div>
            )}
            <p className="text-[#636366]">{customerFeedback.today_feedback}</p>
            {customerFeedback.adjustment_priorities.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[0.8125rem] font-medium text-[#86868b]">今天最重要的調整</p>
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
              {customerFeedback.follow_up_for_tomorrow ? (
                <p className="mt-2 text-[0.875rem] text-[#636366]">{customerFeedback.follow_up_for_tomorrow}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </CrmCard>

      <div className="grid gap-2">
        {continueBackfillLabel && onContinueBackfill ? (
          <CrmButton onClick={onContinueBackfill} type="button">
            {continueBackfillLabel}
          </CrmButton>
        ) : null}
        {onOpenHistory ? (
          <CrmButton onClick={onOpenHistory} type="button">
            回到陪跑紀錄
          </CrmButton>
        ) : null}
        <CrmButton onClick={onEdit} type="button" variant="secondary">
          修改{dayLabel}回報
        </CrmButton>
      </div>

      {dailyLog.submittedAt ? (
        <p className="text-center text-[0.8125rem] text-[#86868b]">
          送出時間：{new Date(dailyLog.submittedAt).toLocaleString("zh-TW")}
        </p>
      ) : null}
    </div>
  );
}

function ProgressStep({
  label,
  done = false,
  active = false,
  hint,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
  hint?: string;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-[0.875rem] px-3 py-2 ${
        active ? "bg-[#f4f7f1] text-[#1d1d1f]" : done ? "text-[#1d1d1f]" : "text-[#86868b]"
      }`}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>{done ? "✓" : active ? "…" : "○"}</span>
        {label}
      </span>
      {hint ? <span className="tabular-nums text-[0.8125rem] text-[#86868b]">{hint}</span> : null}
    </li>
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
