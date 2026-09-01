"use client";

import { useState, type ReactNode } from "react";
import type { CoachConsoleViewModel } from "@/lib/coaching/semantics/build-coach-console";
import type { DailyFactRow } from "@/lib/coaching/semantics/types";

function markGlyph(mark: DailyFactRow["mark"]): string {
  if (mark === "done") return "✓";
  if (mark === "partial") return "◑";
  return "—";
}

function Section({
  kicker,
  title,
  children,
  tone = "plain",
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  tone?: "plain" | "action" | "ai";
}) {
  const surface =
    tone === "action"
      ? "border border-[#e8ece4] bg-[#f7faf5]"
      : tone === "ai"
        ? "border border-[#ececf1] bg-[#f8f8fa]"
        : "bg-white";
  return (
    <section className={`space-y-3 rounded-[1.25rem] px-4 py-4 ${surface}`}>
      <div>
        <p className="text-[0.75rem] font-medium tracking-wide text-[#86868b]">{kicker}</p>
        <h2 className="mt-1 text-[1.125rem] font-semibold leading-snug text-[#1d1d1f]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function CoachConsoleView({
  view,
  onRecordAction,
  actionSavedHint,
  extraJudgment,
  fullReport,
}: {
  view: CoachConsoleViewModel;
  onRecordAction?: () => void;
  actionSavedHint?: boolean;
  extraJudgment?: ReactNode;
  fullReport?: ReactNode;
}) {
  const [showFullReport, setShowFullReport] = useState(false);
  const factRows = view.report.facts.filter((row) => row.key !== "note");
  const noteFact = view.report.facts.find((row) => row.key === "note");

  return (
    <div className="space-y-4">
      <Section kicker="今天要做什麼" title={view.nextAction.title} tone="action">
        <p className="text-[0.9375rem] leading-relaxed text-[#1d1d1f]">{view.nextAction.body}</p>
        {view.nextAction.cta ? (
          <p className="text-[0.875rem] font-medium text-[#3f6212]">{view.nextAction.cta}</p>
        ) : null}
        {view.nextAction.showRecordAction && onRecordAction ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1d1d1f] px-5 text-[0.875rem] font-medium text-white"
            onClick={onRecordAction}
          >
            記錄已處理
          </button>
        ) : null}
        {actionSavedHint ? (
          <p className="text-[0.8125rem] text-[#3f6212]">請在下方「教練處理紀錄」完成記錄。</p>
        ) : null}
      </Section>

      <Section kicker="今天發生了什麼" title={view.report.coachStatusLine}>
        <ul className="divide-y divide-[#f2f2f7]">
          {factRows.map((row) => (
            <li key={row.key} className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="text-[0.875rem] text-[#86868b]">
                {markGlyph(row.mark)} {row.label}
              </span>
              <span className="max-w-[60%] truncate text-right text-[0.9375rem] font-medium text-[#1d1d1f]">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
        {noteFact ? (
          <div className="rounded-[0.875rem] bg-[#f5f5f7] px-3 py-2.5">
            <p className="text-[0.75rem] font-medium text-[#86868b]">
              {view.freeText?.displayLabel ?? "顧客原文"}
            </p>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-[#1d1d1f]">「{noteFact.value}」</p>
            {view.waterConflict ? (
              <p className="mt-2 text-[0.8125rem] text-[#636366]">
                結構化水分仍是 {view.structuredWaterMl} ml，沒有用這段文字改寫水量。
              </p>
            ) : null}
          </div>
        ) : null}
        {fullReport ? (
          <div>
            <button
              type="button"
              className="min-h-11 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
              onClick={() => setShowFullReport((open) => !open)}
            >
              {showFullReport ? "收合完整回報" : "查看完整回報"}
            </button>
            {showFullReport ? <div className="mt-2">{fullReport}</div> : null}
          </div>
        ) : null}
      </Section>

      <Section kicker="AI 教練判斷" title={view.aiJudgment[0]?.conclusion ?? "根據今天的紀錄判斷"} tone="ai">
        <div className="space-y-3">
          {view.aiJudgment.slice(0, 4).map((item, index) => (
            <article key={`${item.conclusion}-${index}`} className="rounded-[0.875rem] bg-white px-3 py-3">
              <p className="text-[0.9375rem] leading-relaxed text-[#1d1d1f]">{item.conclusion}</p>
              {item.confidence === "low" ? (
                <p className="mt-1 text-[0.75rem] text-[#86868b]">目前資料不足以當成確定事實</p>
              ) : null}
              {item.evidence[0]?.summary ? (
                <p className="mt-1 text-[0.75rem] leading-relaxed text-[#86868b]">{item.evidence[0].summary}</p>
              ) : null}
            </article>
          ))}
        </div>
        <div className="rounded-[0.875rem] bg-white px-3 py-3">
          <p className="text-[0.75rem] font-medium text-[#86868b]">成果與分享機會</p>
          <p className="mt-1 text-[0.9375rem] font-semibold text-[#1d1d1f]">{view.shareCopy}</p>
        </div>
        <p className="text-[0.875rem] leading-relaxed text-[#636366]">{view.measurementHeadline}</p>
        <ul className="space-y-1 text-[0.875rem] text-[#1d1d1f]">
          {view.measurements.map((row) => (
            <li key={row.key}>{row.displayLine}</li>
          ))}
        </ul>
        {extraJudgment}
      </Section>
    </div>
  );
}
