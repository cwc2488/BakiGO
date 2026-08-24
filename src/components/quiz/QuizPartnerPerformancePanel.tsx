"use client";

import {
  QUIZ_PARTNER_EMPTY_RATE,
  QUIZ_PARTNER_RANGE_LABEL,
  type QuizPartnerRange,
} from "@/lib/quiz/partner/quiz-partner-presentation";

export type QuizPartnerFunnelView = {
  range: QuizPartnerRange;
  counts: {
    humanViews: number;
    quizStarted: number;
    quizCompleted: number;
    reportReady: number;
    interested21d: number;
    joined: number;
  };
  rates: {
    quizComplete: string;
    reportTo21d: string;
    interestToJoined: string;
  };
};

const STEPS: Array<{ key: keyof QuizPartnerFunnelView["counts"]; label: string }> = [
  { key: "humanViews", label: "真人瀏覽" },
  { key: "quizStarted", label: "開始測驗" },
  { key: "quizCompleted", label: "完成測驗" },
  { key: "reportReady", label: "完成 AI 分析" },
  { key: "interested21d", label: "想了解 21 天" },
  { key: "joined", label: "已成交" },
];

export function QuizPartnerPerformancePanel({
  funnel,
  range,
  onRange,
}: {
  funnel: QuizPartnerFunnelView;
  range: QuizPartnerRange;
  onRange: (next: QuizPartnerRange) => void;
}) {
  const empty = Object.values(funnel.counts).every((value) => value === 0);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(Object.keys(QUIZ_PARTNER_RANGE_LABEL) as QuizPartnerRange[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onRange(item)}
            className={`min-h-10 flex-1 rounded-full px-3 text-[0.8125rem] font-semibold ${
              range === item ? "bg-[#1d1d1f] text-white" : "bg-[#f4e6ea] text-[#8a5a66]"
            }`}
          >
            {QUIZ_PARTNER_RANGE_LABEL[item]}
          </button>
        ))}
      </div>
      <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
        <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">我的成效</h2>
        {empty ? (
          <p className="mt-4 text-[0.9375rem] leading-7 text-[#86868b]">{QUIZ_PARTNER_EMPTY_RATE}</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {STEPS.map((step, index) => (
              <li key={step.key} className="flex items-center justify-between gap-3">
                <span className="text-[0.9375rem] text-[#1d1d1f]">
                  {index > 0 ? <span className="mr-2 text-[#c08a98]">↓</span> : null}
                  {step.label}
                </span>
                <span className="text-[1.125rem] font-semibold tabular-nums text-[#1d1d1f]">
                  {funnel.counts[step.key]}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
        <h3 className="text-[0.9375rem] font-semibold text-[#1d1d1f]">轉換</h3>
        <dl className="mt-3 space-y-3 text-[0.9375rem]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#636366]">測驗完成率</dt>
            <dd className="font-semibold text-[#1d1d1f]">{funnel.rates.quizComplete}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#636366]">Report → 21D 意向率</dt>
            <dd className="font-semibold text-[#1d1d1f]">{funnel.rates.reportTo21d}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#636366]">21D 意向 → 成交率</dt>
            <dd className="font-semibold text-[#1d1d1f]">{funnel.rates.interestToJoined}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
