import { createHash } from "node:crypto";
import {
  createInitialInsightSession,
  INSIGHT_CONSULTANT_PROMPT_VERSION,
  type InsightSessionState,
} from "@/lib/analysis/interview/insight/insight-contract";
import {
  INSIGHT_REPORT_JSON_SCHEMA,
  INSIGHT_REPORT_MODEL,
  INSIGHT_REPORT_PROMPT_VERSION,
  buildInsightReportSystemPrompt,
  insightReportSchema,
  type InsightReport,
} from "@/lib/analysis/interview/insight/insight-report";
import type { QuizPrior } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

/** Preview consumer persistence wrapper. Does not change insight internals. */
export const INSIGHT_PREVIEW_META_KEY = "__insightConsultant" as const;
export const INSIGHT_PREVIEW_SCHEMA_VERSION = "analysis_insight_preview_v1" as const;

export const INSIGHT_PREVIEW_UI_OPENING =
  "選擇題我先當成未驗證背景，不是結論。你想從哪裡講都可以。";

export type InsightPreviewSession = {
  version: typeof INSIGHT_PREVIEW_SCHEMA_VERSION;
  promptVersion: typeof INSIGHT_CONSULTANT_PROMPT_VERSION;
  consultant: InsightSessionState;
  currentQuestionId: string;
  lastFingerprint: string | null;
};

export function isInsightPreviewSession(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  const meta = raw?.[INSIGHT_PREVIEW_META_KEY];
  return Boolean(
    meta &&
      typeof meta === "object" &&
      (meta as { version?: string }).version === INSIGHT_PREVIEW_SCHEMA_VERSION,
  );
}

export function readInsightPreview(
  raw: Record<string, unknown> | null | undefined,
): InsightPreviewSession | null {
  if (!isInsightPreviewSession(raw)) return null;
  return raw![INSIGHT_PREVIEW_META_KEY] as InsightPreviewSession;
}

export function packInsightPreview(
  answers: Record<string, unknown>,
  session: InsightPreviewSession,
): Record<string, unknown> {
  return { ...answers, [INSIGHT_PREVIEW_META_KEY]: session };
}

export function createInsightPreviewSession(): InsightPreviewSession {
  return {
    version: INSIGHT_PREVIEW_SCHEMA_VERSION,
    promptVersion: INSIGHT_CONSULTANT_PROMPT_VERSION,
    consultant: createInitialInsightSession(),
    currentQuestionId: "ins_t1",
    lastFingerprint: null,
  };
}

export function insightPreviewFingerprint(questionId: string, value: unknown): string {
  return createHash("sha256").update(`${questionId}::${JSON.stringify(value)}`).digest("hex");
}

export function nextInsightQuestionId(state: InsightSessionState): string {
  const userTurns = state.turns.filter((t) => t.role === "user").length;
  return `ins_t${userTurns + 1}`;
}

export function insightPreviewQuestion(session: InsightPreviewSession) {
  if (!session.currentQuestionId) return null;
  return {
    id: session.currentQuestionId,
    type: "free_text",
    prompt: "",
    options: [] as Array<{ id: string; label: string }>,
    maxLength: 400,
  };
}

export function insightPreviewSpoken(session: InsightPreviewSession): string {
  return (session.consultant.pendingResponse || "").trim() || INSIGHT_PREVIEW_UI_OPENING;
}

/** Uses the existing insight `opening` field. Does not change insight context schema. */
export function unverifiedInsightOpening(input: {
  animalName?: string | null;
  tagline?: string | null;
  coreInsight?: string | null;
}): string {
  const animal = input.animalName
    ? `Fun/shareable animal interpretation only, not a diagnosis or fixed personality: ${input.animalName}${input.tagline ? ` · ${input.tagline}` : ""}${input.coreInsight ? `. ${input.coreInsight}` : ""}.`
    : "";
  return [
    "UNVERIFIED BACKGROUND. Dynamic Quiz answers and any animal interpretation are starting guesses only. You may trust, partly trust, overturn, or ignore them. Latest spoken user correction wins.",
    animal,
  ]
    .filter(Boolean)
    .join(" ");
}

export type InsightCompressedReport = InsightReport & {
  version: typeof INSIGHT_REPORT_PROMPT_VERSION;
};

export function isInsightCompressedReport(value: unknown): value is InsightCompressedReport {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.version === INSIGHT_REPORT_PROMPT_VERSION &&
    typeof row.stuck_pattern === "string" &&
    typeof row.why_methods_failed === "string" &&
    typeof row.first_change === "string"
  );
}

function shouldUseFixture(): boolean {
  if (process.env.ANALYSIS_AI_USE_FIXTURE === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

export function buildInsightCompressedReportFixture(): InsightCompressedReport {
  return {
    version: INSIGHT_REPORT_PROMPT_VERSION,
    stuck_pattern:
      "你真正卡住的是明明知道怎麼做，壓力一來卻立刻回到最快的放鬆方式，所以計畫很難變成日常。",
    why_methods_failed:
      "以前的方法容易失敗，是因為它們要求你先拿掉目前最有效的紓壓，卻沒有準備第二個出口。",
    first_change:
      "先在最容易破功的那個時刻，準備一個不是吃的短出口，而不是再換一套更狠的方法。",
  };
}

export async function generateInsightPreviewLayer2(input: {
  quizPrior?: QuizPrior | null;
  reasoning?: InsightSessionState["reasoning"];
  transcript: Array<{ role: string; text: string }>;
}): Promise<{
  report: InsightCompressedReport;
  model: string;
  promptVersion: string;
  usedFixture: boolean;
  inputTokens: number;
  outputTokens: number;
}> {
  if (shouldUseFixture()) {
    return {
      report: buildInsightCompressedReportFixture(),
      model: "fixture",
      promptVersion: INSIGHT_REPORT_PROMPT_VERSION,
      usedFixture: true,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("not_configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: INSIGHT_REPORT_MODEL,
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: "json_schema", json_schema: INSIGHT_REPORT_JSON_SCHEMA },
      messages: [
        { role: "system", content: buildInsightReportSystemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            promptVersion: INSIGHT_REPORT_PROMPT_VERSION,
            quizPrior: input.quizPrior ?? null,
            reasoning: input.reasoning ?? null,
            transcript: input.transcript,
          }),
        },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`openai_${response.status}:${text.slice(0, 120)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const parsed = insightReportSchema.safeParse(JSON.parse(payload.choices?.[0]?.message?.content || "{}"));
  if (!parsed.success) throw new Error("parse_failed");
  return {
    report: { version: INSIGHT_REPORT_PROMPT_VERSION, ...parsed.data },
    model: INSIGHT_REPORT_MODEL,
    promptVersion: INSIGHT_REPORT_PROMPT_VERSION,
    usedFixture: false,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
  };
}
