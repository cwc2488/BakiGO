"use client";

import { useEffect, useState } from "react";
import { CrmButton, CrmCard } from "@/components/members/ui";
import { countPrimaryMealsDone, isMealReported } from "@/lib/coaching/coaching-completion";
import { formatSleepTimeRange } from "@/lib/coaching/coaching-sleep";
import { nextCoachingAiPollIntervalMs } from "@/lib/coaching/ai/coaching-ai-latency";
import type { ImmediateDailyFeedback } from "@/lib/coaching/immediate-daily-feedback";
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

type AiPollState = "analyzing" | "ready" | "deferred";

type ProgressStepKey = "received" | "organizing_meals" | "analyzing_day" | "personalized_ready";

const PROGRESS_LABELS: Record<ProgressStepKey, string> = {
  received: "今日紀錄已收到",
  organizing_meals: "正在整理三餐",
  analyzing_day: "正在分析今天的狀況",
  personalized_ready: "個人化建議完成",
};

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
  initialImmediateFeedback = null,
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
  initialImmediateFeedback?: ImmediateDailyFeedback | null;
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
  const [immediateFeedback, setImmediateFeedback] = useState<ImmediateDailyFeedback | null>(
    initialImmediateFeedback,
  );
  const [activeStep, setActiveStep] = useState<ProgressStepKey>("organizing_meals");
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    setImmediateFeedback(initialImmediateFeedback);
  }, [initialImmediateFeedback]);

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
          immediateFeedback?: ImmediateDailyFeedback | null;
          aiOutput?: {
            status: string;
            customer: CoachingDailyGenerationCustomerOutput | null;
            activeStep?: ProgressStepKey;
          };
        };

        if (cancelled) return;

        if (response.ok && payload.ok) {
          if (payload.immediateFeedback?.lines?.length) {
            setImmediateFeedback(payload.immediateFeedback);
          }
          if (payload.aiOutput?.activeStep) {
            setActiveStep(payload.aiOutput.activeStep);
          }
          if (payload.aiOutput?.status === "completed" && payload.aiOutput.customer) {
            setCustomerFeedback(payload.aiOutput.customer);
            setAiState("ready");
            setActiveStep("personalized_ready");
            return;
          }
          if (payload.aiOutput?.status === "failed") {
            setAiState("deferred");
            return;
          }
          if (payload.aiOutput?.status === "processing") {
            setActiveStep("analyzing_day");
          } else if (payload.aiOutput?.status === "pending") {
            setActiveStep("organizing_meals");
          }
        }
      } catch {
        // Keep polling until timeout — submit already succeeded; Layer 1 remains.
      }

      if (cancelled) return;

      if (Date.now() - startedAt >= COACHING_AI_CUSTOMER_POLL_TIMEOUT_MS) {
        setAiState("deferred");
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

  const progressOrder: ProgressStepKey[] = [
    "received",
    "organizing_meals",
    "analyzing_day",
    "personalized_ready",
  ];
  const activeIndex = progressOrder.indexOf(activeStep);

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
              ? "基本回饋已完成。進階分析進行中，你可以先離開，完成後回來就能看到。"
              : aiState === "ready"
                ? `${logDate} · 個人化分析已就緒`
                : `${logDate} · 今天的基本回饋已經完成`}
          </p>
        </div>
        {aiState === "analyzing" ? (
          <ol className="mx-auto grid max-w-sm gap-2 text-left text-[0.875rem] text-[#636366]">
            {progressOrder.map((step, index) => (
              <ProgressStep
                key={step}
                label={PROGRESS_LABELS[step]}
                done={index < activeIndex}
                active={index === activeIndex}
                hint={index === activeIndex && elapsedSec > 0 ? `${elapsedSec}s` : undefined}
              />
            ))}
          </ol>
        ) : null}
      </CrmCard>

      <CrmCard className="space-y-3 text-left">
        <h3 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">今日即時回饋</h3>
        {immediateFeedback?.lines?.length ? (
          <ul className="space-y-2 text-[0.9375rem] leading-relaxed text-[#1d1d1f]">
            {immediateFeedback.lines.map((line) => (
              <li key={line} className="rounded-[1rem] bg-[#f7faf5] px-4 py-3">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.9375rem] text-[#636366]">今天的回報已記錄，基本回饋整理中。</p>
        )}
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
        <h3 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">AI 個人化分析</h3>
        {aiState === "analyzing" ? (
          <div className="space-y-2 rounded-[1rem] bg-[#fafafa] px-4 py-5 text-[0.9375rem] leading-relaxed text-[#636366]">
            <p>正在進一步分析你的飲食與今天的紀錄，完成後會自動補上。</p>
            <p>你可以先離開，完成後回來就能看到。</p>
          </div>
        ) : null}
        {aiState === "deferred" ? (
          <p className="rounded-[1rem] bg-[#fafafa] px-4 py-5 text-[0.9375rem] leading-relaxed text-[#636366]">
            今天的基本回饋已經完成，進階分析稍後再補上。
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
