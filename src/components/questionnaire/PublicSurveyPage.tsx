"use client";

import { useCallback, useEffect, useState } from "react";
import {
  QUESTIONNAIRE_CONTACT_TYPE_LABEL,
  QUESTIONNAIRE_CONTACT_TYPES,
  QUESTIONNAIRE_EXERCISE_OPTIONS,
  QUESTIONNAIRE_IMPROVEMENT_AREAS,
  QUESTIONNAIRE_INTEREST_OPTIONS,
  QUESTIONNAIRE_LIMITS,
  QUESTIONNAIRE_PUBLIC_COPY,
} from "@/lib/questionnaire/contract";
import type { QuestionnairePublicConfig, QuestionnaireSource } from "@/types/questionnaire";

type FormState = {
  improvementAreas: string[];
  improvementOther: string;
  bodySatisfactionScore: number | null;
  weeklyExerciseFrequency: string;
  usesSupplements: boolean | null;
  supplementDetails: string;
  priorityImprovement: string;
  furtherUnderstandingInterest: string;
  displayName: string;
  contactType: string;
  contactValue: string;
  consentAccepted: boolean;
  companyWebsite: string;
};

const EMPTY_FORM: FormState = {
  improvementAreas: [],
  improvementOther: "",
  bodySatisfactionScore: null,
  weeklyExerciseFrequency: "",
  usesSupplements: null,
  supplementDetails: "",
  priorityImprovement: "",
  furtherUnderstandingInterest: "",
  displayName: "",
  contactType: "line",
  contactValue: "",
  consentAccepted: false,
  companyWebsite: "",
};

export function PublicSurveyPage({
  code,
  initialSource,
}: {
  code: string;
  initialSource: QuestionnaireSource;
}) {
  const [config, setConfig] = useState<QuestionnairePublicConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = initialSource;

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/public/questionnaire/${encodeURIComponent(code)}?source=${source}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setLoadError("問卷連結無效或已停用。");
        return;
      }
      const body = (await res.json()) as QuestionnairePublicConfig;
      setConfig(body);
    } catch {
      setLoadError("無法載入問卷，請稍後再試。");
    }
  }, [code, source]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleArea(area: string) {
    setForm((prev) => {
      const has = prev.improvementAreas.includes(area);
      return {
        ...prev,
        improvementAreas: has
          ? prev.improvementAreas.filter((a) => a !== area)
          : [...prev.improvementAreas, area],
      };
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setDone(false);
    setError(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/questionnaire/${encodeURIComponent(code)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          improvementAreas: form.improvementAreas,
          improvementOther: form.improvementOther || null,
          bodySatisfactionScore: form.bodySatisfactionScore,
          weeklyExerciseFrequency: form.weeklyExerciseFrequency,
          usesSupplements: form.usesSupplements,
          supplementDetails: form.supplementDetails || null,
          priorityImprovement: form.priorityImprovement,
          furtherUnderstandingInterest: form.furtherUnderstandingInterest,
          displayName: form.displayName,
          contactType: form.contactType,
          contactValue: form.contactValue,
          consentAccepted: form.consentAccepted,
          companyWebsite: form.companyWebsite,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(body.error ?? "送出失敗，請再試一次。");
        return;
      }
      setDone(true);
    } catch {
      setError("送出失敗，請再試一次。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-dvh bg-[#f7f4ef] px-5 py-16 text-[#1d1d1f]">
        <div className="mx-auto max-w-md space-y-3">
          <h1 className="text-[1.5rem] font-semibold tracking-tight">連結無效</h1>
          <p className="text-[0.9375rem] leading-7 text-[#636366]">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-dvh bg-[#f7f4ef] px-5 py-16 text-[#636366]">
        <p className="mx-auto max-w-md text-[0.9375rem]">載入中…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-dvh bg-[#f7f4ef] px-5 py-16 text-[#1d1d1f]">
        <div className="mx-auto max-w-md space-y-6">
          <h1 className="text-[1.5rem] font-semibold tracking-tight">
            {QUESTIONNAIRE_PUBLIC_COPY.thanks}
          </h1>
          {source === "onsite" ? (
            <button
              type="button"
              onClick={resetForm}
              className="flex min-h-12 w-full items-center justify-center rounded-[1rem] bg-[#1d1d1f] px-4 text-[1rem] font-semibold text-white"
            >
              下一份問卷
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f7f4ef] px-5 py-10 text-[#1d1d1f]">
      <div className="mx-auto max-w-md space-y-8">
        <header className="space-y-3">
          <h1 className="text-[1.5rem] font-semibold tracking-tight">{config.title}</h1>
          <p className="whitespace-pre-line text-[0.9375rem] leading-7 text-[#636366]">
            {config.description}
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-[1rem] font-semibold">你目前最想改善的是哪一方面？</h2>
          <p className="text-[0.8125rem] text-[#8e8e93]">可複選，至少選一項</p>
          <div className="space-y-2">
            {QUESTIONNAIRE_IMPROVEMENT_AREAS.map((area) => {
              const checked = form.improvementAreas.includes(area);
              return (
                <label
                  key={area}
                  className={`flex min-h-11 items-center gap-3 rounded-[0.875rem] border px-3 ${
                    checked ? "border-[#1d1d1f] bg-white" : "border-[#d2d2d7] bg-white/70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleArea(area)}
                    className="h-4 w-4"
                  />
                  <span className="text-[0.9375rem]">{area}</span>
                </label>
              );
            })}
          </div>
          {form.improvementAreas.includes("其他") ? (
            <input
              value={form.improvementOther}
              onChange={(e) => setForm((p) => ({ ...p, improvementOther: e.target.value }))}
              maxLength={QUESTIONNAIRE_LIMITS.improvementOtherMax}
              placeholder="請說明其他需求"
              className="w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-2.5 text-[0.9375rem]"
            />
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-[1rem] font-semibold">
            如果以 1～5 分來說，你對自己目前的身體狀態滿意幾分？
          </h2>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => setForm((p) => ({ ...p, bodySatisfactionScore: score }))}
                className={`flex min-h-14 flex-col items-center justify-center rounded-[0.875rem] border text-[1rem] font-semibold ${
                  form.bodySatisfactionScore === score
                    ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                    : "border-[#d2d2d7] bg-white"
                }`}
              >
                {score}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[0.75rem] text-[#8e8e93]">
            <span>很不滿意</span>
            <span>很滿意</span>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[1rem] font-semibold">你平常一週大約運動幾次？</h2>
          <div className="space-y-2">
            {QUESTIONNAIRE_EXERCISE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm((p) => ({ ...p, weeklyExerciseFrequency: opt.value }))}
                className={`flex min-h-11 w-full items-center rounded-[0.875rem] border px-3 text-left text-[0.9375rem] ${
                  form.weeklyExerciseFrequency === opt.value
                    ? "border-[#1d1d1f] bg-white font-semibold"
                    : "border-[#d2d2d7] bg-white/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[1rem] font-semibold">
            請問你有使用健康食品或補給品的習慣嗎？有的話是什麼？
          </h2>
          <div className="flex gap-2">
            {[
              { value: false, label: "沒有" },
              { value: true, label: "有" },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() =>
                  setForm((p) => ({
                    ...p,
                    usesSupplements: opt.value,
                    supplementDetails: opt.value ? p.supplementDetails : "",
                  }))
                }
                className={`flex min-h-11 flex-1 items-center justify-center rounded-[0.875rem] border text-[0.9375rem] font-semibold ${
                  form.usesSupplements === opt.value
                    ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                    : "border-[#d2d2d7] bg-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {form.usesSupplements === true ? (
            <div className="space-y-2">
              <p className="text-[0.875rem] text-[#636366]">目前有使用哪些健康食品或補給品？</p>
              <textarea
                value={form.supplementDetails}
                onChange={(e) => setForm((p) => ({ ...p, supplementDetails: e.target.value }))}
                maxLength={QUESTIONNAIRE_LIMITS.supplementDetailsMax}
                rows={3}
                placeholder="例如：乳清蛋白、維生素、益生菌"
                className="w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-2.5 text-[0.9375rem]"
              />
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-[1rem] font-semibold">
            如果現在只能先改善一件事，你最希望是哪一件？
          </h2>
          <textarea
            value={form.priorityImprovement}
            onChange={(e) => setForm((p) => ({ ...p, priorityImprovement: e.target.value }))}
            maxLength={QUESTIONNAIRE_LIMITS.priorityImprovementMax}
            rows={3}
            className="w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-2.5 text-[0.9375rem]"
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-[1rem] font-semibold">
            如果有人可以免費幫你更了解目前的身體狀況，你會有興趣嗎？
          </h2>
          <div className="space-y-2">
            {QUESTIONNAIRE_INTEREST_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setForm((p) => ({ ...p, furtherUnderstandingInterest: opt.value }))
                }
                className={`flex min-h-11 w-full items-center rounded-[0.875rem] border px-3 text-left text-[0.9375rem] ${
                  form.furtherUnderstandingInterest === opt.value
                    ? "border-[#1d1d1f] bg-white font-semibold"
                    : "border-[#d2d2d7] bg-white/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[1rem] font-semibold">
            方便留下聯絡方式，之後把結果或相關資訊傳給你嗎？
          </h2>
          <input
            value={form.displayName}
            onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
            maxLength={QUESTIONNAIRE_LIMITS.displayNameMax}
            placeholder="稱呼／暱稱"
            className="w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-2.5 text-[0.9375rem]"
          />
          <div className="flex gap-2">
            {QUESTIONNAIRE_CONTACT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm((p) => ({ ...p, contactType: type, contactValue: "" }))}
                className={`flex min-h-10 flex-1 items-center justify-center rounded-[0.75rem] border text-[0.8125rem] font-semibold ${
                  form.contactType === type
                    ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                    : "border-[#d2d2d7] bg-white"
                }`}
              >
                {QUESTIONNAIRE_CONTACT_TYPE_LABEL[type]}
              </button>
            ))}
          </div>
          <input
            value={form.contactValue}
            onChange={(e) => setForm((p) => ({ ...p, contactValue: e.target.value }))}
            maxLength={QUESTIONNAIRE_LIMITS.contactValueMax}
            placeholder={
              form.contactType === "line"
                ? "LINE ID"
                : form.contactType === "instagram"
                  ? "IG 帳號"
                  : "電話"
            }
            className="w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-2.5 text-[0.9375rem]"
          />
        </section>

        {/* Honeypot — hidden from humans */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
          <label>
            Company website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.companyWebsite}
              onChange={(e) => setForm((p) => ({ ...p, companyWebsite: e.target.value }))}
            />
          </label>
        </div>

        <section className="space-y-2">
          <label className="flex items-start gap-3 text-[0.875rem] leading-6 text-[#1d1d1f]">
            <input
              type="checkbox"
              checked={form.consentAccepted}
              onChange={(e) => setForm((p) => ({ ...p, consentAccepted: e.target.checked }))}
              className="mt-1 h-4 w-4"
            />
            <span>{QUESTIONNAIRE_PUBLIC_COPY.consentLabel}</span>
          </label>
          <p className="pl-7 text-[0.75rem] text-[#8e8e93]">{QUESTIONNAIRE_PUBLIC_COPY.consentHint}</p>
        </section>

        {error ? (
          <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
        ) : null}

        <button
          type="button"
          disabled={submitting || !form.consentAccepted}
          onClick={() => void submit()}
          className="flex min-h-12 w-full items-center justify-center rounded-[1rem] bg-[#1d1d1f] px-4 text-[1rem] font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "送出中…" : "送出問卷"}
        </button>
      </div>
    </div>
  );
}
