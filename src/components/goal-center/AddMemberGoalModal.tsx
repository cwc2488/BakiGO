"use client";

import { MobileFormModal } from "@/components/ui/MobileFormModal";
import {
  MEMBER_GOAL_HORIZON_LABELS,
  MEMBER_GOAL_TYPE_LABELS,
  type MemberGoalHorizon,
  type MemberGoalType,
} from "@/types/member-goal";
import { useState } from "react";

const GOAL_TYPE_OPTIONS: Array<{ key: MemberGoalType; placeholder: string }> = [
  { key: "monthly_vp", placeholder: "例如 5000" },
  { key: "monthly_income_ntd", placeholder: "例如 100000" },
  { key: "monthly_new_customers", placeholder: "例如 10" },
];

const HORIZON_OPTIONS: MemberGoalHorizon[] = ["short", "medium", "long"];

export function AddMemberGoalModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    type: MemberGoalType;
    targetValue: number;
    horizon: MemberGoalHorizon;
    label?: string;
  }) => void;
}) {
  const [type, setType] = useState<MemberGoalType>("monthly_vp");
  const [targetValue, setTargetValue] = useState("");
  const [horizon, setHorizon] = useState<MemberGoalHorizon>("short");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedType = GOAL_TYPE_OPTIONS.find((option) => option.key === type)!;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = Number(targetValue.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("請輸入有效的目標數字");
      return;
    }

    onSubmit({
      type,
      targetValue: parsed,
      horizon,
      label: label.trim() || undefined,
    });
    setTargetValue("");
    setLabel("");
    setType("monthly_vp");
    setHorizon("short");
    onClose();
  }

  return (
    <MobileFormModal
      footer={
        <button
          className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3.5 text-[1rem] font-semibold text-white"
          form="add-member-goal-form"
          type="submit"
        >
          新增目標
        </button>
      }
      onClose={onClose}
      open={open}
      title="新增我的目標"
    >
      <form className="space-y-4" id="add-member-goal-form" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">目標類型</span>
          <select
            className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            onChange={(event) => setType(event.target.value as MemberGoalType)}
            value={type}
          >
            {GOAL_TYPE_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {MEMBER_GOAL_TYPE_LABELS[option.key]}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">目標數值</span>
          <input
            className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            inputMode="numeric"
            onChange={(event) => setTargetValue(event.target.value)}
            placeholder={selectedType.placeholder}
            value={targetValue}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">時間範圍</span>
          <select
            className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            onChange={(event) => setHorizon(event.target.value as MemberGoalHorizon)}
            value={horizon}
          >
            {HORIZON_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {MEMBER_GOAL_HORIZON_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">備註（選填）</span>
          <input
            className="w-full rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
            onChange={(event) => setLabel(event.target.value)}
            placeholder="例如：衝刺月"
            value={label}
          />
        </label>

        {error ? <p className="text-[0.875rem] text-[#ff375f]">{error}</p> : null}
      </form>
    </MobileFormModal>
  );
}
