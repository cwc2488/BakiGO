"use client";

import { CrmButton } from "@/components/members/ui";
import type { CoachingPlanDraft } from "@/lib/coaching/coaching-plan-draft";
import { defaultPlannedEndDate } from "@/lib/coaching/enrollment-window";

function PlanTextareaField({
  label,
  hint,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{label}</span>
      {hint ? <span className="block text-[0.8125rem] text-[#86868b]">{hint}</span> : null}
      <textarea
        className="min-h-[5rem] w-full rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-[0.9375rem] leading-relaxed"
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[0.875rem] font-medium text-[#636366]">{label}</span>
      <input
        className="w-full rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-[1rem]"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

export function CoachingPlanConfirmForm({
  customerDisplayName,
  goal,
  draft,
  startDate,
  plannedEndAt,
  busy,
  onChange,
  onStartDateChange,
  onPlannedEndAtChange,
  onCancel,
  onConfirm,
}: {
  customerDisplayName: string;
  goal: string;
  draft: CoachingPlanDraft;
  startDate: string;
  plannedEndAt: string;
  busy: boolean;
  onChange: (draft: CoachingPlanDraft) => void;
  onStartDateChange: (startDate: string) => void;
  onPlannedEndAtChange: (plannedEndAt: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const update = (patch: Partial<CoachingPlanDraft>) => {
    onChange({ ...draft, ...patch });
  };

  const handleStartDateChange = (nextStart: string) => {
    onStartDateChange(nextStart);
    if (/^\d{4}-\d{2}-\d{2}$/.test(nextStart)) {
      onPlannedEndAtChange(defaultPlannedEndDate(nextStart));
    }
  };

  return (
    <div className="space-y-4 rounded-[1.25rem] border border-[#eef2ea] bg-[#fafdf8] p-4">
      <div>
        <p className="text-[0.8125rem] font-medium text-[#86868b]">確認陪跑方案</p>
        <p className="mt-1 text-[0.9375rem] text-[#636366]">
          為 {customerDisplayName} 建立陪跑前，請確認以下內容。每段一行一項，可依個案調整。
        </p>
        {goal.trim() ? (
          <p className="mt-2 text-[0.875rem] text-[#86868b]">陪跑目標：{goal.trim()}</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DateField label="開始日" onChange={handleStartDateChange} value={startDate} />
        <DateField label="預計結束日" onChange={onPlannedEndAtChange} value={plannedEndAt} />
      </div>
      <p className="text-[0.75rem] text-[#86868b]">預設為開始日起算 90 天（含第 1 天）。可依個案調整。</p>

      <PlanTextareaField
        hint="定位為本陪跑方案的執行原則，一行一項"
        label="飲食執行原則"
        onChange={(value) => update({ dietaryGuidelines: value })}
        rows={6}
        value={draft.dietaryGuidelines}
      />
      <PlanTextareaField
        label="早餐執行方式"
        onChange={(value) => update({ breakfast: value })}
        value={draft.breakfast}
      />
      <PlanTextareaField
        label="午餐執行方式"
        onChange={(value) => update({ lunch: value })}
        value={draft.lunch}
      />
      <PlanTextareaField
        label="晚餐執行方式"
        onChange={(value) => update({ dinner: value })}
        value={draft.dinner}
      />
      <PlanTextareaField
        label="加餐／水果等提醒"
        onChange={(value) => update({ snacks: value })}
        value={draft.snacks}
      />

      <div className="space-y-3 rounded-[1rem] border border-[#eef2ea] bg-white p-3">
        <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">水量／作息等提醒</p>
        <PlanTextareaField
          label="水量"
          onChange={(value) => update({ hydration: value })}
          value={draft.hydration}
        />
        <PlanTextareaField
          label="起床／第一階段"
          onChange={(value) => update({ wakeUp: value })}
          value={draft.wakeUp}
        />
        <PlanTextareaField
          label="睡眠"
          onChange={(value) => update({ sleep: value })}
          value={draft.sleep}
        />
      </div>

      <PlanTextareaField
        hint="僅存入陪跑方案，供開跑與後續參考"
        label="其他教練備註"
        onChange={(value) => update({ coachNotes: value })}
        rows={3}
        value={draft.coachNotes}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <CrmButton disabled={busy} onClick={onCancel} type="button" variant="secondary">
          返回
        </CrmButton>
        <CrmButton disabled={busy} onClick={onConfirm} type="button">
          {busy ? "建立中…" : "確認並開始陪跑"}
        </CrmButton>
      </div>
    </div>
  );
}
