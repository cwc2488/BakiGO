import { z } from "zod";

/** Isolated compressed Layer2. Does not replace analysis_report_v5 on Preview consumer. */
export const INSIGHT_REPORT_PROMPT_VERSION = "analysis_report_insight_v1" as const;
export const INSIGHT_REPORT_MODEL = "gpt-4.1" as const;

export const INSIGHT_REPORT_TITLES = [
  "我真正看見你卡住的是什麼",
  "為什麼以前的方法容易失敗",
  "現在最值得先改哪一件事",
] as const;

export const insightReportSchema = z.object({
  stuck_pattern: z.string().min(40).max(320),
  why_methods_failed: z.string().min(40).max(320),
  first_change: z.string().min(40).max(280),
});
export type InsightReport = z.infer<typeof insightReportSchema>;

export const INSIGHT_REPORT_JSON_SCHEMA = {
  name: "insight_compressed_report",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["stuck_pattern", "why_methods_failed", "first_change"],
    properties: {
      stuck_pattern: { type: "string" },
      why_methods_failed: { type: "string" },
      first_change: { type: "string" },
    },
  },
} as const;

export function buildInsightReportSystemPrompt(): string {
  return [
    "寫三個互不重複的分析段落。手機第一屏只回答這三題。",
    "1 stuck_pattern：我真正看見你卡住的是什麼？必須是跨多輪的判斷，不是複述最後一句。",
    "2 why_methods_failed：為什麼以前的方法容易失敗？必須和第 1 段回答不同的問題。",
    "3 first_change：現在最值得先改哪一件事？一件、具體、低摩擦。",
    "如果兩段用不同標題講同一件事，合併到最相關的那一段，另一段改寫成真正不同的問題。",
    "Quiz Prior 未驗證。最新直接陳述與訂正優先。不要診斷、開藥、報價、硬銷。繁體中文。",
  ].join("\n");
}

/** Observation: two sections are redundant if n-gram overlap is high. */
export function sectionRedundancyScore(a: string, b: string): number {
  const na = grams(a);
  const nb = grams(b);
  if (!na.size || !nb.size) return 0;
  let inter = 0;
  for (const g of na) if (nb.has(g)) inter += 1;
  return inter / Math.min(na.size, nb.size);
}

function grams(text: string): Set<string> {
  const t = text.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 3; i += 1) out.add(t.slice(i, i + 4));
  return out;
}

export function auditSixSectionRedundancy(sections: string[]): Array<{ i: number; j: number; score: number }> {
  const hits: Array<{ i: number; j: number; score: number }> = [];
  for (let i = 0; i < sections.length; i += 1) {
    for (let j = i + 1; j < sections.length; j += 1) {
      const score = sectionRedundancyScore(sections[i]!, sections[j]!);
      if (score >= 0.28) hits.push({ i, j, score: Number(score.toFixed(2)) });
    }
  }
  return hits;
}
