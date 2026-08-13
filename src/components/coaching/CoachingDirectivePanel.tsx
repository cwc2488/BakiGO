"use client";

import { useCallback, useEffect, useState } from "react";
import { CrmButton, CrmCard, CrmSectionTitle } from "@/components/members/ui";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import {
  DIRECTIVE_MEAL_SLOTS,
  type DirectiveMealSlot,
  type StructuredCoachDirective,
} from "@/lib/coaching/directive-meal-verification";

const MEAL_SLOT_LABELS: Record<DirectiveMealSlot, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "點心",
  general: "全日",
};

const STATUS_LABELS: Record<StructuredCoachDirective["status"], string> = {
  active: "進行中",
  paused: "暫停",
  completed: "已完成",
};

type DirectiveRecord = StructuredCoachDirective & {
  enrollmentId?: string;
};

export default function CoachingDirectivePanel({ enrollmentId }: { enrollmentId: string }) {
  const [directives, setDirectives] = useState<DirectiveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [mealSlot, setMealSlot] = useState<DirectiveMealSlot>("breakfast");
  const [instructionText, setInstructionText] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(coachingTodayLogDate);
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [customerVisible, setCustomerVisible] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/directives`,
      );
      const body = (await response.json()) as {
        ok?: boolean;
        directives?: DirectiveRecord[];
        error?: string;
      };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "無法載入教練指示");
      }
      setDirectives(body.directives ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入教練指示");
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetCreateForm = () => {
    setMealSlot("breakfast");
    setInstructionText("");
    setEffectiveFrom(coachingTodayLogDate());
    setEffectiveUntil("");
    setCustomerVisible(true);
  };

  const createDirective = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/directives`,
        {
          method: "POST",
          body: JSON.stringify({
            mealSlot,
            instructionText: instructionText.trim(),
            effectiveFrom,
            effectiveUntil: effectiveUntil.trim() || null,
            customerVisible,
          }),
        },
      );
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "建立失敗");
      }
      resetCreateForm();
      setShowCreate(false);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "建立失敗");
    } finally {
      setBusy(false);
    }
  };

  const patchDirective = async (
    directiveId: string,
    patch: {
      status?: StructuredCoachDirective["status"];
      customerVisible?: boolean;
      instructionText?: string;
      effectiveFrom?: string;
      effectiveUntil?: string | null;
      mealSlot?: DirectiveMealSlot;
    },
  ) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/directives`,
        {
          method: "PATCH",
          body: JSON.stringify({ directiveId, ...patch }),
        },
      );
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "更新失敗");
      }
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CrmCard className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CrmSectionTitle>教練安排</CrmSectionTitle>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">
            設定餐次執行指示，供核對與顧客提醒（與 Vision／AI 文案分層）。
          </p>
        </div>
        <CrmButton
          disabled={busy}
          onClick={() => {
            if (!showCreate) resetCreateForm();
            setShowCreate((value) => !value);
          }}
          type="button"
          variant="secondary"
        >
          {showCreate ? "取消" : "新增指示"}
        </CrmButton>
      </div>

      {error ? <p className="text-[0.875rem] text-[#cf1322]">{error}</p> : null}
      {loading ? <p className="text-[0.875rem] text-[#86868b]">載入中…</p> : null}

      {showCreate ? (
        <div className="space-y-3 rounded-[1rem] border border-[#eef2ea] bg-[#fafdf8] p-3">
          <label className="block space-y-2">
            <span className="text-[0.875rem] font-medium text-[#636366]">餐次</span>
            <select
              className="w-full rounded-[1rem] border border-[#e5e5ea] bg-white px-4 py-3 text-[1rem]"
              onChange={(event) => setMealSlot(event.target.value as DirectiveMealSlot)}
              value={mealSlot}
            >
              {DIRECTIVE_MEAL_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {MEAL_SLOT_LABELS[slot]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-[0.875rem] font-medium text-[#636366]">指示內容</span>
            <textarea
              className="min-h-[4.5rem] w-full rounded-[1rem] border border-[#e5e5ea] bg-white px-4 py-3 text-[0.9375rem]"
              onChange={(event) => setInstructionText(event.target.value)}
              placeholder="例如：早餐喝奶昔"
              rows={3}
              value={instructionText}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-[0.875rem] font-medium text-[#636366]">生效起</span>
              <input
                className="w-full rounded-[1rem] border border-[#e5e5ea] bg-white px-4 py-3 text-[1rem]"
                onChange={(event) => setEffectiveFrom(event.target.value)}
                type="date"
                value={effectiveFrom}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[0.875rem] font-medium text-[#636366]">生效迄（選填）</span>
              <input
                className="w-full rounded-[1rem] border border-[#e5e5ea] bg-white px-4 py-3 text-[1rem]"
                onChange={(event) => setEffectiveUntil(event.target.value)}
                type="date"
                value={effectiveUntil}
              />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[0.9375rem] text-[#1d1d1f]">
            <input
              checked={customerVisible}
              className="h-4 w-4"
              onChange={(event) => setCustomerVisible(event.target.checked)}
              type="checkbox"
            />
            顧客可見
          </label>
          <CrmButton
            disabled={busy || !instructionText.trim() || !effectiveFrom}
            onClick={() => void createDirective()}
            type="button"
          >
            {busy ? "儲存中…" : "建立指示"}
          </CrmButton>
        </div>
      ) : null}

      {!loading && directives.length === 0 ? (
        <p className="text-[0.875rem] text-[#86868b]">尚無指示。可新增早餐喝奶昔等執行提醒。</p>
      ) : null}

      <ul className="space-y-2">
        {directives.map((directive) => (
          <li key={directive.id} className="rounded-[1rem] border border-[#eef2ea] px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[0.75rem] text-[#86868b]">
                  {MEAL_SLOT_LABELS[directive.mealSlot]} · {STATUS_LABELS[directive.status]}
                  {directive.customerVisible ? " · 顧客可見" : " · 僅教練"}
                </p>
                <p className="mt-1 text-[0.9375rem] font-medium text-[#1d1d1f]">
                  {directive.instructionText}
                </p>
                <p className="mt-1 text-[0.75rem] text-[#86868b]">
                  {directive.effectiveFrom}
                  {directive.effectiveUntil ? ` → ${directive.effectiveUntil}` : " 起"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {directive.status === "active" ? (
                <CrmButton
                  disabled={busy}
                  onClick={() => void patchDirective(directive.id, { status: "paused" })}
                  type="button"
                  variant="secondary"
                >
                  暫停
                </CrmButton>
              ) : null}
              {directive.status === "paused" ? (
                <CrmButton
                  disabled={busy}
                  onClick={() => void patchDirective(directive.id, { status: "active" })}
                  type="button"
                  variant="secondary"
                >
                  恢復
                </CrmButton>
              ) : null}
              {directive.status !== "completed" ? (
                <CrmButton
                  disabled={busy}
                  onClick={() => void patchDirective(directive.id, { status: "completed" })}
                  type="button"
                  variant="secondary"
                >
                  完成
                </CrmButton>
              ) : null}
              <CrmButton
                disabled={busy}
                onClick={() =>
                  void patchDirective(directive.id, {
                    customerVisible: !directive.customerVisible,
                  })
                }
                type="button"
                variant="secondary"
              >
                {directive.customerVisible ? "改為僅教練" : "改為顧客可見"}
              </CrmButton>
            </div>
          </li>
        ))}
      </ul>
    </CrmCard>
  );
}
