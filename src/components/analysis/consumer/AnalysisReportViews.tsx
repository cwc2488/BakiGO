"use client";

import { ANALYSIS_AI_SECTION_TITLES } from "@/lib/analysis/analysis-ai-schema";
import { REVEAL_SECTION_TITLES } from "@/components/analysis/experience/experience-copy";
import {
  INSIGHT_REPORT_TITLES,
  type InsightReport,
} from "@/lib/analysis/interview/insight/insight-report";
import { isInsightCompressedReport } from "@/lib/analysis/insight-preview-bridge";

type AiReport = {
  section1_personality: string;
  section2_why_change: string;
  section3_why_failed: string;
  section4_lifestyle: string;
  section5_one_change: string;
  section6_next_step: string;
};

/** Pick a short highlight sentence from existing content — no new insight invented. */
export function pickHighlightSentence(text: string): string | null {
  const parts = text
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const ranked = [...parts].sort((a, b) => b.length - a.length);
  const pick = ranked.find((s) => s.length >= 18 && s.length <= 90) ?? parts[0]!;
  return pick;
}

export function AnalysisReportHeader({
  respondentName,
  animalName,
  tagline,
  summary,
  coreInsight,
}: {
  respondentName: string;
  animalName: string;
  tagline: string;
  summary: string;
  coreInsight?: string;
}) {
  const insight = coreInsight?.trim() || summary;
  return (
    <header className="ax-share-card space-y-3" data-share-card="analysis-reveal">
      <p className="ax-kicker">你是哪一種瘦不下來的人？</p>
      <p className="qc-caption tracking-[0.14em]">YOUR TYPE</p>
      <h2 className="ax-type">
        {animalName ? (
          <>
            {animalName}
            {tagline ? ` · ${tagline}` : ""}
          </>
        ) : (
          "你的減脂卡關"
        )}
      </h2>
      <p className="ax-insight">{insight}</p>
      <p className="qc-caption">{respondentName}的個人分析</p>
    </header>
  );
}

export function AnalysisInsightCard({
  coreStuck,
  changeState,
  showGenerating,
  progressCopy,
}: {
  coreStuck: string;
  changeState?: string | null;
  showGenerating: boolean;
  progressCopy: string;
}) {
  return (
    <section className="qc-card space-y-4 p-6" aria-label="即時整理">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-lg" aria-hidden>
          ✨
        </span>
        <div>
          <p className="qc-caption font-medium tracking-[0.06em] text-[var(--qc-accent-rose)]">
            我們先看到一件很重要的事
          </p>
          <h2 className="qc-subheading mt-1">先給你的即時整理</h2>
        </div>
      </div>
      <p className="qc-body text-[1.02rem] font-medium leading-7 text-[var(--qc-text)]">{coreStuck}</p>
      {changeState ? <p className="qc-body">{changeState}</p> : null}
      {showGenerating ? (
        <div className="qc-surface-soft relative overflow-hidden px-4 py-3">
          <div className="qc-shimmer pointer-events-none absolute inset-0" aria-hidden />
          <p className="qc-body relative text-[0.95rem]">✨ {progressCopy}</p>
        </div>
      ) : null}
    </section>
  );
}

export function AnalysisReportSections({ report }: { report: AiReport | InsightReport }) {
  if (isInsightCompressedReport(report) || ("stuck_pattern" in report && "first_change" in report)) {
    const compressed = report as InsightReport;
    const sections = [
      compressed.stuck_pattern,
      compressed.why_methods_failed,
      compressed.first_change,
    ] as const;
    return (
      <section className="space-y-5" aria-label="你的個人分析內容" data-insight-report="compressed-3">
        {sections.map((text, index) => {
          const title = INSIGHT_REPORT_TITLES[index]!;
          const indexLabel = String(index + 1).padStart(2, "0");
          const emphasized = index === 0;
          return (
            <article
              key={title}
              className={
                index < 2
                  ? "space-y-2 border-b border-[var(--qc-border)] pb-5"
                  : "qc-card space-y-2 p-5"
              }
              data-internal-section={title}
            >
              <h3 className={`qc-subheading ${emphasized ? "text-[1.2rem]" : ""}`}>
                <span className="ax-section-index mr-2">{indexLabel}</span>
                {title}？
              </h3>
              <p className="qc-body">{text}</p>
            </article>
          );
        })}
      </section>
    );
  }

  const six = report as AiReport;
  const sections = [
    six.section1_personality,
    six.section2_why_change,
    six.section3_why_failed,
    six.section4_lifestyle,
    six.section5_one_change,
    six.section6_next_step,
  ] as const;

  return (
    <section className="space-y-5" aria-label="你的個人分析內容">
      {sections.map((text, index) => {
        const title = REVEAL_SECTION_TITLES[index] ?? ANALYSIS_AI_SECTION_TITLES[index]!;
        const internalTitle = ANALYSIS_AI_SECTION_TITLES[index]!;
        const emphasized = index === 2;
        const highlight = index === 4 ? pickHighlightSentence(text) : null;
        const indexLabel = String(index + 1).padStart(2, "0");

        if (index === 4) {
          return (
            <article key={title} className="qc-card space-y-2 p-5" data-internal-section={internalTitle}>
              <p className="ax-section-index">{indexLabel}</p>
              <h3 className="qc-subheading mt-1">{title}</h3>
              {highlight ? (
                <p className="mt-3 border-l-[3px] border-[var(--qc-accent-rose)] pl-3 text-[1.02rem] font-semibold leading-7 text-[var(--qc-text)]">
                  {highlight}
                </p>
              ) : null}
              <p className="qc-body mt-3">{text}</p>
            </article>
          );
        }

        if (index === 5) {
          return (
            <article key={title} className="qc-card space-y-2 p-5" data-internal-section={internalTitle}>
              <p className="ax-section-index">{indexLabel}</p>
              <h3 className="qc-subheading">{title}</h3>
              <p className="qc-body mt-2">{text}</p>
            </article>
          );
        }

        return (
          <article
            key={title}
            className="space-y-2 border-b border-[var(--qc-border)] pb-5"
            data-internal-section={internalTitle}
          >
            <h3 className={`qc-subheading ${emphasized ? "text-[1.2rem]" : ""}`}>
              <span className="ax-section-index mr-2">{indexLabel}</span>
              {title}
            </h3>
            <p className="qc-body">{text}</p>
          </article>
        );
      })}
    </section>
  );
}
