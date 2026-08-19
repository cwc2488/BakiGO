import {
  ANALYSIS_AI_MODEL_ID,
  ANALYSIS_AI_PROMPT_VERSION,
  ANALYSIS_AI_REPORT_JSON_SCHEMA,
  ANALYSIS_AI_TIMEOUT_MS,
  analysisAiReportSchema,
  buildAnalysisAiSystemPrompt,
  buildAnalysisAiUserPrompt,
  type AnalysisAiInputSnapshot,
  type AnalysisAiReport,
} from "@/lib/analysis/analysis-ai-schema";
import { buildLlmCallLogEntry, logLlmCall } from "@/lib/ai/llm-telemetry";

export class AnalysisAiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisAiConfigError";
  }
}

export type AnalysisAiGenerationResult = {
  report: AnalysisAiReport;
  model: string;
  promptVersion: string;
  latencyMs: number;
  usedFixture: boolean;
  inputTokens?: number;
  outputTokens?: number;
};

function shouldUseFixture(): boolean {
  if (process.env.ANALYSIS_AI_USE_FIXTURE === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

function buildFixtureReport(snapshot: AnalysisAiInputSnapshot): AnalysisAiReport {
  const animal = snapshot.quiz.animalName;
  const why = String((snapshot.answers as { why_now?: string }).why_now ?? "想改變");
  const stuck = String((snapshot.answers as { why_stuck?: string }).why_stuck ?? "diet_control");
  const trigger = String((snapshot.answers as { trigger_context?: string }).trigger_context ?? "night");
  const sleep = String((snapshot.answers as { sleep_hours?: string }).sleep_hours ?? "6_7");
  const work = String((snapshot.answers as { work_style?: string }).work_style ?? "sedentary");
  return analysisAiReportSchema.parse({
    section1_personality: `你現在卡住的，比較不像「不懂怎麼吃」，而比較像「${animal}」這類模式：白天還撐得住，一到容易失守的情境（尤其與「${stuck}」有關）就會整段節奏被帶走。`,
    section2_why_change: `以前容易失敗，往往不是少一次嘗試，而是「想改變的理由」與「失守情境」沒對上：你在意的是「${why.slice(0, 40)}」，但方法需要長時間高自制力；一忙、一累就會斷。`,
    section3_why_failed: `最值得先處理的根本原因，通常是「高自制力假設」本身：方法只在狀態好時行得通，狀態一掉就失效，所以再更努力也難延續。`,
    section4_lifestyle: `把工作節奏（${work}）、睡眠（${sleep}）和觸發情境（${trigger}）放在一起看：白天消耗意志力，晚上疲勞與飢餓疊加時，原本計畫最容易一起垮。`,
    section5_one_change: `先只改一件低摩擦的事：針對你最常失守的時段，預先準備一個「差不多就好」的替代選擇，讓自己不用在最累時重新做決定。`,
    section6_next_step: snapshot.safetyFlagged
      ? `適合你的下一步是先把生活節奏與失守情境記清楚，只做一般、可逆的小調整；若有醫師叮囑，醫療決策請回診討論，而不是一次改完全部。`
      : `比起再找更嚴格的方法，你更需要一段短時間依真實生活微調：先做得到，再依實際反應慢慢調整，而不是一次要求全部做到。`,
  });
}

export async function generateAnalysisAiReport(input: {
  snapshot: AnalysisAiInputSnapshot;
  inputFingerprint: string;
}): Promise<AnalysisAiGenerationResult> {
  const started = Date.now();
  if (shouldUseFixture() || !process.env.OPENAI_API_KEY) {
    const report = buildFixtureReport(input.snapshot);
    return {
      report,
      model: "fixture",
      promptVersion: ANALYSIS_AI_PROMPT_VERSION,
      latencyMs: Date.now() - started,
      usedFixture: true,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AnalysisAiConfigError("OPENAI_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_AI_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: ANALYSIS_AI_MODEL_ID,
        temperature: 0.4,
        response_format: {
          type: "json_schema",
          json_schema: ANALYSIS_AI_REPORT_JSON_SCHEMA,
        },
        messages: [
          { role: "system", content: buildAnalysisAiSystemPrompt() },
          { role: "user", content: buildAnalysisAiUserPrompt(input.snapshot) },
        ],
      }),
    });

    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const text = await response.text();
      await logLlmCall({
        feature: "analysis",
        pointKey: "personalized_report",
        customerId: null,
        enrollmentId: null,
        ownerMemberId: null,
        model: ANALYSIS_AI_MODEL_ID,
        promptVersion: ANALYSIS_AI_PROMPT_VERSION,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, imageCount: 0 },
        latencyMs,
        status: "failed",
        errorCode: `http_${response.status}`,
        inputFingerprint: input.inputFingerprint,
      });
      throw new Error(`OpenAI error ${response.status}: ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI content");
    const parsedJson = JSON.parse(content) as unknown;
    const parsed = analysisAiReportSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error(`parse_validation: ${parsed.error.message}`);
    }

    await logLlmCall({
      feature: "analysis",
      pointKey: "personalized_report",
      customerId: null,
      enrollmentId: null,
      ownerMemberId: null,
      model: ANALYSIS_AI_MODEL_ID,
      promptVersion: ANALYSIS_AI_PROMPT_VERSION,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
        cachedInputTokens: payload.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        imageCount: 0,
      },
      latencyMs,
      status: "completed",
      inputFingerprint: input.inputFingerprint,
    });

    return {
      report: parsed.data,
      model: ANALYSIS_AI_MODEL_ID,
      promptVersion: ANALYSIS_AI_PROMPT_VERSION,
      latencyMs,
      usedFixture: false,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function classifyAnalysisAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  const lower = message.toLowerCase();
  if (lower.includes("abort") || lower.includes("timeout")) return "timeout";
  if (lower.includes("openai") || lower.includes("llm") || lower.includes("http_")) return "llm_upstream";
  if (lower.includes("parse") || lower.includes("schema") || lower.includes("json")) return "parse_validation";
  if (lower.includes("supabase") || lower.includes("database") || lower.includes("postgres")) return "db";
  return message.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 64) || "generation_failed";
}

// Keep buildLlmCallLogEntry import used for types in tests
void buildLlmCallLogEntry;
