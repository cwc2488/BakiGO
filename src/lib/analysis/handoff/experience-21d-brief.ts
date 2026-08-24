import type { ResetReport, ResetTurn } from "@/lib/analysis/reset/reset-contract";

export const EXPERIENCE_21D_READINESS = ["low", "medium", "high", "unknown"] as const;
export type Experience21dReadiness = (typeof EXPERIENCE_21D_READINESS)[number];

export type CoachHandoffBrief = {
  why_now: string;
  real_bottleneck: string;
  past_pattern: string;
  first_change: string;
  readiness: Experience21dReadiness;
  important_context: string;
  avoid_assumption: string;
  suggested_opening: string;
};

function plain(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function userTexts(turns: ResetTurn[]): string[] {
  return turns.filter((turn) => turn.role === "user").map((turn) => turn.text.trim()).filter(Boolean);
}

export function derive21dReadiness(turns: ResetTurn[]): Experience21dReadiness {
  const blob = userTexts(turns).join("\n");
  if (!blob) return "unknown";
  const urgent = /健檢|健康|醫生|數字|喘|怕|急|受不了|真的想/.test(blob);
  const hesitant = /還好|沒有很急|不知道|再說|朋友叫我/.test(blob);
  const starting = /想開始|想了解|怎麼開始|可以怎麼/.test(blob);
  if (hesitant && !urgent) return "low";
  if (urgent && starting) return "high";
  if (urgent || blob.length > 24) return "medium";
  return "unknown";
}

function pastPatternFromSpeech(turns: ResetTurn[]): string {
  const hits = userTexts(turns).filter((text) => /以前|成功過|復胖|又胖|破功|反彈/.test(text));
  if (!hits.length) return "尚未確認";
  return hits.join("；");
}

function importantContextFromSpeech(turns: ResetTurn[]): string {
  const hits = userTexts(turns).filter((text) =>
    /工作|累|健康|健檢|自信|時間|吃|壓力|睡眠/.test(text),
  );
  if (!hits.length) return "尚未確認";
  return hits.slice(0, 4).join("；");
}

function firstUserQuote(turns: ResetTurn[]): string | null {
  const texts = userTexts(turns);
  const rich = texts.find((text) => text.length >= 6) ?? texts[0];
  return rich ?? null;
}

export function compileCoachHandoffBrief(input: {
  report: ResetReport;
  turns: ResetTurn[];
  quizPrimary: string | null;
}): CoachHandoffBrief {
  const quote = firstUserQuote(input.turns);
  const spoken = userTexts(input.turns).join("\n");
  const quizContradicted =
    Boolean(input.quizPrimary === "A") && /健康|健檢|不是不自律|工作很累|沒力氣/.test(spoken);
  const avoid = quizContradicted
    ? "不要把問題簡化成不自律。口頭證據已經蓋過測驗假設。"
    : "不要把問題簡化成不自律。測驗動物只是未驗證背景。";
  const openingQuote = quote ? `你提到「${quote}」。` : "我想先從你剛才願意說的部分了解現在的生活狀況。";
  return {
    why_now: plain(input.report.why_now),
    real_bottleneck: plain(input.report.bottleneck),
    past_pattern: pastPatternFromSpeech(input.turns),
    first_change: plain(input.report.first_change),
    readiness: derive21dReadiness(input.turns),
    important_context: importantContextFromSpeech(input.turns),
    avoid_assumption: avoid,
    suggested_opening: `我有先看過你剛才的分析。${openingQuote}我想先從這裡了解你現在的生活狀況。`,
  };
}

export function assertBriefHasNoInvention(brief: CoachHandoffBrief, spoken: string): boolean {
  if (brief.past_pattern !== "尚未確認" && !/以前|成功過|復胖|又胖|破功|反彈/.test(spoken) && !spoken.includes(brief.past_pattern)) {
    return false;
  }
  return !/保證瘦|Herbalife|劑量|NT\$|一定可以/.test(JSON.stringify(brief));
}
