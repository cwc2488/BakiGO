"use client";

import { CrmButton, CrmCard } from "@/components/members/ui";
import { countPrimaryMealsDone, isMealReported } from "@/lib/coaching/coaching-completion";
import { formatSleepTimeRange } from "@/lib/coaching/coaching-sleep";
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

export function CoachingDailyCompleteView({
  dailyLog,
  mealDrafts,
  logDate,
  onEdit,
}: {
  dailyLog: CoachingDailyLogDetail;
  mealDrafts: Record<CoachingMealSlot, MealDraft>;
  logDate: string;
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
        <p className="rounded-[1rem] border border-dashed border-[#e5e5ea] bg-[#fafafa] px-4 py-5 text-[0.9375rem] leading-relaxed text-[#86868b]">
          AI Daily Coach 回饋區域（即將推出）
        </p>
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
