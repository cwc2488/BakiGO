import { after } from "next/server";
import { logLlmCall } from "@/lib/ai/llm-telemetry";
import {
  INSIGHT_CONSULTANT_MODEL,
  INSIGHT_CONSULTANT_PROMPT_VERSION,
  INSIGHT_MAX_OUTPUT_TOKENS,
  INSIGHT_TIMEOUT_MS,
  INSIGHT_TURN_JSON_SCHEMA,
  emptyInsightReasoning,
  insightTurnSchema,
  type InsightSessionState,
  type InsightTurn,
} from "@/lib/analysis/interview/insight/insight-contract";
import { buildInsightSystemPrompt } from "@/lib/analysis/interview/insight/insight-prompts";
import { buildInsightUserPrompt } from "@/lib/analysis/interview/insight/insight-context";
import type { QuizPrior } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

function shouldUseFixture(): boolean {
  if (process.env.ANALYSIS_AI_USE_FIXTURE === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

export function buildInsightFixtureTurn(currentAnswer: string): InsightTurn {
  const medical = /醫生|醫師|血糖|紅字|吃藥/.test(currentAnswer);
  return {
    private_reasoning: {
      ...emptyInsightReasoning(),
      surface_statement: currentAnswer.slice(0, 80),
      current_best_hypothesis: "stated reason may be surface-level; wait for more turns",
      what_changed_this_turn: currentAnswer.slice(0, 80),
      most_valuable_next_move: medical ? "listen" : "hypothesize",
    },
    assistant_response: medical
      ? "醫療的事我不會幫你下判斷。你剛說的那些，我先當背景，不拿來解釋成病因。"
      : "我先不把你剛說的那句當結論。我想看它和前面幾句放在一起會不會變成另一件事。",
    safety_signal: { needs_boundary: medical, reason: medical ? "medical_context" : null },
  };
}

export async function generateInsightTurn(input: {
  state: InsightSessionState;
  currentAnswer: string;
  quizPrior?: QuizPrior | null;
  quizHistory?: Array<{ question: string; selected: string[] }>;
  opening?: string | null;
  contractRepair?: { violations: string[]; note: string };
  model?: string;
}): Promise<{
  output: InsightTurn;
  usedFixture: boolean;
  inputTokens: number;
  outputTokens: number;
  openaiMs: number;
  latencyMs: number;
}> {
  const started = Date.now();
  if (shouldUseFixture()) {
    return {
      output: buildInsightFixtureTurn(input.currentAnswer),
      usedFixture: true,
      inputTokens: 0,
      outputTokens: 0,
      openaiMs: 0,
      latencyMs: Date.now() - started,
    };
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("not_configured");

  const model = input.model || input.state.conversationModel || INSIGHT_CONSULTANT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INSIGHT_TIMEOUT_MS);
  const dispatchStarted = Date.now();
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: INSIGHT_MAX_OUTPUT_TOKENS,
        response_format: {
          type: "json_schema",
          json_schema: INSIGHT_TURN_JSON_SCHEMA,
        },
        messages: [
          { role: "system", content: buildInsightSystemPrompt() },
          { role: "user", content: buildInsightUserPrompt(input) },
        ],
      }),
    });
    const openaiMs = Date.now() - dispatchStarted;
    if (!response.ok) {
      const text = await response.text();
      logInsightLlm({
        model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: openaiMs,
        status: "failed",
        errorCode: `http_${response.status}`,
      });
      throw new Error(`OpenAI error ${response.status}: ${text.slice(0, 160)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI content");
    const parsed = insightTurnSchema.safeParse(JSON.parse(content));
    if (!parsed.success) throw new Error(`parse_validation: ${parsed.error.message}`);
    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    logInsightLlm({
      model,
      inputTokens,
      outputTokens,
      latencyMs: openaiMs,
      status: "completed",
    });
    return {
      output: parsed.data,
      usedFixture: false,
      inputTokens,
      outputTokens,
      openaiMs,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function logInsightLlm(entry: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: "completed" | "failed";
  errorCode?: string;
}): void {
  const run = () => {
    void logLlmCall({
      feature: "analysis",
      pointKey: "insight_consultant",
      customerId: null,
      enrollmentId: null,
      ownerMemberId: null,
      model: entry.model,
      promptVersion: INSIGHT_CONSULTANT_PROMPT_VERSION,
      usage: {
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cachedInputTokens: 0,
        imageCount: 0,
      },
      latencyMs: entry.latencyMs,
      status: entry.status,
      errorCode: entry.errorCode,
    }).catch(() => undefined);
  };
  try {
    after(run);
  } catch {
    run();
  }
}
