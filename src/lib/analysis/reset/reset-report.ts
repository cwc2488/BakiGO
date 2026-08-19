import { z } from "zod";
import {
  RESET_MODEL,
  RESET_REPORT_MAX_TOKENS,
  RESET_REPORT_PROMPT_VERSION,
  RESET_TIMEOUT_MS,
} from "@/lib/analysis/reset/reset-path";
import {
  RESET_REPORT_PRESENTATION_INSTRUCTION,
  buildResetReportSystemPrompt,
} from "@/lib/analysis/reset/reset-prompts";
import type { ResetReport, ResetTurn } from "@/lib/analysis/reset/reset-contract";

export const RESET_REPORT_TITLES = [
  "我真正看見你卡住的是什麼？",
  "為什麼以前的方法容易失敗？",
  "現在最值得先改哪一件事？",
] as const;

const reportSchema = z.object({
  why_now: z.string().min(24).max(320),
  bottleneck: z.string().min(24).max(320),
  first_change: z.string().min(24).max(280),
});

export const RESET_REPORT_JSON_SCHEMA = {
  name: "reset_insight_report",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["why_now", "bottleneck", "first_change"],
    properties: {
      why_now: { type: "string" },
      bottleneck: { type: "string" },
      first_change: { type: "string" },
    },
  },
} as const;

function shouldUseFixture(): boolean {
  if (process.env.ANALYSIS_AI_USE_FIXTURE === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

export function buildResetReportFixture(): ResetReport {
  return {
    version: RESET_REPORT_PROMPT_VERSION,
    why_now: "你現在想改變，比較不像是突然對數字感興趣，而是最近開始受不了自己現在這個樣子被別人、也被自己看見。",
    bottleneck:
      "真正卡住你的，比較像是你其實知道怎麼做，但壓力或疲勞一來，最快的出口會把計畫整段蓋掉，所以不是知識不夠。",
    first_change: "先守住最容易破功的那一個時刻，準備一個不是吃的短出口，而不是再換一套更狠的方法。",
  };
}

export async function generateResetReport(input: {
  transcript: ResetTurn[];
  compactQuizBackground: string;
}): Promise<{
  report: ResetReport;
  inputTokens: number;
  outputTokens: number;
  openaiMs: number;
  usedFixture: boolean;
}> {
  if (shouldUseFixture()) {
    return {
      report: buildResetReportFixture(),
      inputTokens: 0,
      outputTokens: 0,
      openaiMs: 0,
      usedFixture: true,
    };
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("not_configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESET_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: RESET_MODEL,
        temperature: 0.4,
        max_tokens: RESET_REPORT_MAX_TOKENS,
        response_format: { type: "json_schema", json_schema: RESET_REPORT_JSON_SCHEMA },
        messages: [
          { role: "system", content: buildResetReportSystemPrompt() },
          { role: "system", content: RESET_REPORT_PRESENTATION_INSTRUCTION },
          {
            role: "user",
            content: JSON.stringify({
              promptVersion: RESET_REPORT_PROMPT_VERSION,
              compactQuizBackground: input.compactQuizBackground,
              transcript: input.transcript.map((t) => ({ role: t.role, text: t.text })),
            }),
          },
        ],
      }),
    });
    const openaiMs = Date.now() - started;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`openai_${response.status}:${text.slice(0, 120)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const parsed = reportSchema.safeParse(JSON.parse(payload.choices?.[0]?.message?.content || "{}"));
    if (!parsed.success) throw new Error("parse_failed");
    return {
      report: { version: RESET_REPORT_PROMPT_VERSION, ...parsed.data },
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
      openaiMs,
      usedFixture: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
