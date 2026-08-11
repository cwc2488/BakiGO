"use client";

import { useState } from "react";
import { useConsultationFlowActions } from "@/components/consultation/ConsultationFlowContext";
import {
  ConsultationField,
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationInput,
  ConsultationPrimaryButton,
  ConsultationTextarea,
} from "@/components/consultation/ConsultationFlowShell";
import { CONSULTATION_STEP_META } from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import { buildOptimisticStepRecord } from "@/lib/consultation/consultation-step-navigation";
import type { ConsultationMealsData, ConsultationSessionRecord } from "@/types/consultation";

const SERVICE_ITEMS = [
  {
    title: "每週回測調整",
    body: "定期追蹤身體數據與執行狀況，依進度調整方向。",
  },
  {
    title: "營養課程",
    body: "賀寶芙營養師／每月營養課等既有合法文案，由夥伴依現場方案說明。",
  },
  {
    title: "每日飲食監督／三餐回報",
    body: "協助建立可持續的飲食節奏。未來可使用 AI 飲食陪跑（V1 尚未開放）。",
  },
  {
    title: "配合飲食",
    body: "這裡才進入產品相關說明。請使用現場合法文案，不自行宣稱功效、套餐或價格。",
  },
];

export function ConsultationStep13MealsServices({
  sessionId,
  record,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
}) {
  const { completeOptimistic } = useConsultationFlowActions();
  const initialMeals = record.data.dataJson.meals ?? {};
  const [breakfastTime, setBreakfastTime] = useState(initialMeals.breakfast?.time ?? "");
  const [breakfastContent, setBreakfastContent] = useState(initialMeals.breakfast?.content ?? "");
  const [lunchTime, setLunchTime] = useState(initialMeals.lunch?.time ?? "");
  const [lunchContent, setLunchContent] = useState(initialMeals.lunch?.content ?? "");
  const [dinnerTime, setDinnerTime] = useState(initialMeals.dinner?.time ?? "");
  const [dinnerContent, setDinnerContent] = useState(initialMeals.dinner?.content ?? "");
  const [servicesExplained, setServicesExplained] = useState(record.data.dataJson.services?.explained ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = CONSULTATION_STEP_META[13];

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!servicesExplained) {
      setError("請完成四項服務說明後再繼續。");
      return;
    }
    setLoading(true);
    setError(null);
    const meals: ConsultationMealsData = {
      breakfast: { time: breakfastTime.trim() || undefined, content: breakfastContent.trim() || undefined },
      lunch: { time: lunchTime.trim() || undefined, content: lunchContent.trim() || undefined },
      dinner: { time: dinnerTime.trim() || undefined, content: dinnerContent.trim() || undefined },
    };
    const services = { explained: true, explainedAt: new Date().toISOString() };
    const optimisticRecord = buildOptimisticStepRecord(record, 13, { meals, services });
    completeOptimistic({
      stepNumber: 13,
      priorRecord: record,
      optimisticRecord,
      savePromise: saveConsultationStepApi(sessionId, 13, { meals, services: { explained: true } }),
    });
    setLoading(false);
  }

  return (
    <ConsultationFlowShell step={13} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[#2f2622]">三餐盤點</h2>
          {[
            ["早餐", breakfastTime, setBreakfastTime, breakfastContent, setBreakfastContent],
            ["午餐", lunchTime, setLunchTime, lunchContent, setLunchContent],
            ["晚餐", dinnerTime, setDinnerTime, dinnerContent, setDinnerContent],
          ].map(([label, time, setTime, content, setContent]) => (
            <div key={String(label)} className="rounded-[1.25rem] bg-white/90 p-4 ring-1 ring-[#eadfd6]">
              <ConsultationField label={String(label)}>
                <ConsultationInput
                  type="time"
                  value={String(time)}
                  onChange={(event) => (setTime as (value: string) => void)(event.target.value)}
                />
              </ConsultationField>
              <ConsultationField label={`${String(label)}內容`}>
                <ConsultationTextarea
                  value={String(content)}
                  onChange={(event) => (setContent as (value: string) => void)(event.target.value)}
                />
              </ConsultationField>
            </div>
          ))}
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[#2f2622]">四項服務說明</h2>
          {SERVICE_ITEMS.map((item) => (
            <div key={item.title} className="rounded-[1.25rem] bg-white/90 p-4 ring-1 ring-[#eadfd6]">
              <p className="font-medium text-[#2f2622]">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-[#6f5f57]">{item.body}</p>
            </div>
          ))}
          <p className="text-xs text-[#9a8b82]">教練課另計；實際優惠依目前方案規則。</p>
          <label className="flex items-start gap-3 rounded-[1.25rem] bg-white px-4 py-4 ring-1 ring-[#eadfd6]">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={servicesExplained}
              onChange={(event) => setServicesExplained(event.target.checked)}
            />
            <span className="text-sm leading-6 text-[#6f5f57]">我已完成四項服務說明。</span>
          </label>
        </section>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading || !servicesExplained}>
            {loading ? "儲存中…" : "完成三餐與服務說明，下一步"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
