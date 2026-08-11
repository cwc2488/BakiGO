"use client";

import { useState } from "react";
import {
  ConsultationField,
  ConsultationFlowShell,
  ConsultationFormActions,
  ConsultationInput,
  ConsultationPrimaryButton,
  ConsultationTextarea,
} from "@/components/consultation/ConsultationFlowShell";
import {
  CONSULTATION_COOPERATION_STATUS_LABELS,
  CONSULTATION_EXERCISE_METHOD_LABELS,
  CONSULTATION_STEP_META,
} from "@/lib/consultation/consultation-flow-engine";
import { saveConsultationStepApi } from "@/lib/consultation/consultation-client";
import {
  CONSULTATION_EXERCISE_METHOD_KEYS,
  type ConsultationCooperationData,
  type ConsultationCooperationStatus,
  type ConsultationExerciseMethodKey,
  type ConsultationSessionRecord,
} from "@/types/consultation";

const STATUS_OPTIONS = Object.keys(CONSULTATION_COOPERATION_STATUS_LABELS) as ConsultationCooperationStatus[];

function StatusPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ConsultationCooperationStatus | "";
  onChange: (next: ConsultationCooperationStatus) => void;
}) {
  return (
    <ConsultationField label={label}>
      <div className="grid grid-cols-1 gap-2">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded-full px-4 py-3 text-sm font-medium ${
              value === option ? "bg-[#2f2622] text-white" : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
            }`}
            onClick={() => onChange(option)}
          >
            {CONSULTATION_COOPERATION_STATUS_LABELS[option]}
          </button>
        ))}
      </div>
    </ConsultationField>
  );
}

export function ConsultationStep12Cooperation({
  sessionId,
  record,
  onCompleted,
}: {
  sessionId: string;
  record: ConsultationSessionRecord;
  onCompleted: (next: ConsultationSessionRecord) => void;
}) {
  const initial = record.data.dataJson.cooperation ?? {};
  const [hydrationStatus, setHydrationStatus] = useState<ConsultationCooperationStatus | "">(
    initial.hydration?.status ?? "",
  );
  const [hydrationReason, setHydrationReason] = useState(initial.hydration?.difficultyReason ?? "");
  const [sleepStatus, setSleepStatus] = useState<ConsultationCooperationStatus | "">(
    initial.sleepSchedule?.status ?? "",
  );
  const [sleepTime, setSleepTime] = useState(initial.sleepSchedule?.currentSleepTime ?? "");
  const [wakeTime, setWakeTime] = useState(initial.sleepSchedule?.currentWakeTime ?? "");
  const [sleepAdjust, setSleepAdjust] = useState(initial.sleepSchedule?.targetAdjustment ?? "");
  const [sleepReason, setSleepReason] = useState(initial.sleepSchedule?.difficultyReason ?? "");
  const [exerciseStatus, setExerciseStatus] = useState<ConsultationCooperationStatus | "">(
    initial.exercise?.status ?? "",
  );
  const [weeklyFrequency, setWeeklyFrequency] = useState(initial.exercise?.weeklyFrequency ?? "");
  const [exerciseMethods, setExerciseMethods] = useState<ConsultationExerciseMethodKey[]>(
    initial.exercise?.methods ?? [],
  );
  const [exerciseReason, setExerciseReason] = useState(initial.exercise?.difficultyReason ?? "");
  const [nutritionStatus, setNutritionStatus] = useState<ConsultationCooperationStatus | "">(
    initial.nutrition?.status ?? "",
  );
  const [nutritionReason, setNutritionReason] = useState(initial.nutrition?.difficultyReason ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = CONSULTATION_STEP_META[12];

  function toggleMethod(method: ConsultationExerciseMethodKey) {
    setExerciseMethods((current) =>
      current.includes(method) ? current.filter((item) => item !== method) : [...current, method],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const cooperation: Partial<ConsultationCooperationData> = {
      hydration: hydrationStatus
        ? { status: hydrationStatus, difficultyReason: hydrationReason.trim() || undefined }
        : undefined,
      sleepSchedule: sleepStatus
        ? {
            status: sleepStatus,
            currentSleepTime: sleepTime.trim() || undefined,
            currentWakeTime: wakeTime.trim() || undefined,
            targetAdjustment: sleepAdjust.trim() || undefined,
            difficultyReason: sleepReason.trim() || undefined,
          }
        : undefined,
      exercise: exerciseStatus
        ? {
            status: exerciseStatus,
            weeklyFrequency: weeklyFrequency.trim() || undefined,
            methods: exerciseMethods,
            difficultyReason: exerciseReason.trim() || undefined,
          }
        : undefined,
      nutrition: nutritionStatus
        ? { status: nutritionStatus, difficultyReason: nutritionReason.trim() || undefined }
        : undefined,
    };
    try {
      const payload = await saveConsultationStepApi(sessionId, 12, { cooperation });
      if (!payload.session || !payload.data) {
        throw new Error(payload.error ?? "無法儲存 Step 12");
      }
      onCompleted({ session: payload.session, data: payload.data });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法儲存 Step 12");
    } finally {
      setLoading(false);
    }
  }

  function reasonField(
    status: ConsultationCooperationStatus | "",
    value: string,
    onChange: (next: string) => void,
    label: string,
  ) {
    if (status !== "needs_adjustment" && status !== "cannot_do") {
      return null;
    }
    return (
      <ConsultationField label={`${label}原因（必填）`}>
        <ConsultationTextarea value={value} onChange={(event) => onChange(event.target.value)} />
      </ConsultationField>
    );
  }

  return (
    <ConsultationFlowShell step={12} title={meta.title} purpose={meta.purpose}>
      <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
        <section className="space-y-3 rounded-[1.5rem] bg-white/90 p-4 ring-1 ring-[#eadfd6]">
          <h2 className="text-sm font-semibold text-[#2f2622]">1. 水分</h2>
          <p className="text-sm text-[#6f5f57]">依既有諮詢原則與可調整目標記錄，不做醫療化建議。</p>
          <StatusPicker label="配合度" value={hydrationStatus} onChange={setHydrationStatus} />
          {reasonField(hydrationStatus, hydrationReason, setHydrationReason, "水分")}
        </section>
        <section className="space-y-3 rounded-[1.5rem] bg-white/90 p-4 ring-1 ring-[#eadfd6]">
          <h2 className="text-sm font-semibold text-[#2f2622]">2. 作息</h2>
          <ConsultationField label="目前就寢時間（選填）">
            <ConsultationInput type="time" value={sleepTime} onChange={(event) => setSleepTime(event.target.value)} />
          </ConsultationField>
          <ConsultationField label="目前起床時間（選填）">
            <ConsultationInput type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} />
          </ConsultationField>
          <ConsultationField label="可行調整（選填）">
            <ConsultationInput value={sleepAdjust} onChange={(event) => setSleepAdjust(event.target.value)} />
          </ConsultationField>
          <StatusPicker label="配合度" value={sleepStatus} onChange={setSleepStatus} />
          {reasonField(sleepStatus, sleepReason, setSleepReason, "作息")}
        </section>
        <section className="space-y-3 rounded-[1.5rem] bg-white/90 p-4 ring-1 ring-[#eadfd6]">
          <h2 className="text-sm font-semibold text-[#2f2622]">3. 運動</h2>
          <ConsultationField label="每週運動頻率（選填）">
            <ConsultationInput
              value={weeklyFrequency}
              onChange={(event) => setWeeklyFrequency(event.target.value)}
              placeholder="例如：每週 2–3 次"
            />
          </ConsultationField>
          <ConsultationField label="可接受方式">
            <div className="flex flex-wrap gap-2">
              {CONSULTATION_EXERCISE_METHOD_KEYS.map((method) => (
                <button
                  key={method}
                  type="button"
                  className={`rounded-full px-3 py-2 text-sm ${
                    exerciseMethods.includes(method)
                      ? "bg-[#2f2622] text-white"
                      : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
                  }`}
                  onClick={() => toggleMethod(method)}
                >
                  {CONSULTATION_EXERCISE_METHOD_LABELS[method]}
                </button>
              ))}
            </div>
          </ConsultationField>
          <StatusPicker label="配合度" value={exerciseStatus} onChange={setExerciseStatus} />
          {reasonField(exerciseStatus, exerciseReason, setExerciseReason, "運動")}
        </section>
        <section className="space-y-3 rounded-[1.5rem] bg-white/90 p-4 ring-1 ring-[#eadfd6]">
          <h2 className="text-sm font-semibold text-[#2f2622]">4. 飲食／營養</h2>
          <p className="text-sm text-[#6f5f57]">三餐盤點將在下一步記錄。</p>
          <StatusPicker label="配合度" value={nutritionStatus} onChange={setNutritionStatus} />
          {reasonField(nutritionStatus, nutritionReason, setNutritionReason, "飲食")}
        </section>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ConsultationFormActions>
          <ConsultationPrimaryButton type="submit" disabled={loading}>
            {loading ? "儲存中…" : "完成四項評估，下一步"}
          </ConsultationPrimaryButton>
        </ConsultationFormActions>
      </form>
    </ConsultationFlowShell>
  );
}
