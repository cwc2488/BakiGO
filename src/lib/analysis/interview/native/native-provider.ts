import { after } from "next/server";
import {
  NATIVE_INTERVIEW_JSON_SCHEMA,
  NATIVE_INTERVIEW_MAX_OUTPUT_TOKENS,
  NATIVE_INTERVIEW_PROMPT_VERSION,
  NATIVE_INTERVIEW_TIMEOUT_MS,
  blankNativeTurn,
  nativeInterviewTurnSchema,
  type NativeInterviewTurn,
} from "@/lib/analysis/interview/native/native-contract";
import { buildNativeSystemPrompt } from "@/lib/analysis/interview/native/native-prompts";
import { buildNativeUserPrompt } from "@/lib/analysis/interview/native/native-context";
import { buildChatgptSystemPrompt } from "@/lib/analysis/interview/chatgpt/chatgpt-prompts";
import { buildChatgptUserPrompt } from "@/lib/analysis/interview/chatgpt/chatgpt-context";
import { CHATGPT_CONSULTANT_PROMPT_VERSION } from "@/lib/analysis/interview/chatgpt/chatgpt-contract";
import { detectDirectUserQuestion } from "@/lib/analysis/interview/native/native-validate";
import { resolveNativeConsultantVariant } from "@/lib/analysis/interview/native/native-path";
import type { InterviewSessionState } from "@/lib/analysis/interview/interview-contract";
import { logLlmCall } from "@/lib/ai/llm-telemetry";

export type NativeTurnGeneration = {
  output: NativeInterviewTurn;
  model: string;
  latencyMs: number;
  compactContextMs: number;
  openaiDispatchMs: number;
  openaiMs: number;
  parseMs: number;
  usedFixture: boolean;
  inputTokens: number;
  outputTokens: number;
};

function shouldUseFixture(): boolean {
  if (process.env.ANALYSIS_AI_USE_FIXTURE === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

function logNativeLlmCallNonBlocking(entry: Parameters<typeof logLlmCall>[0]): void {
  const run = () => {
    void logLlmCall(entry).catch(() => undefined);
  };
  try {
    after(run);
  } catch {
    run();
  }
}

/**
 * Test / fixture stand-in. Intentionally NOT a Golden script.
 * It must not encode case-specific next questions.
 */
export function buildNativeFixtureTurn(currentAnswer: string): NativeInterviewTurn {
  const kind = detectDirectUserQuestion(currentAnswer);
  const base = blankNativeTurn();
  if (kind === "duration") {
    return {
      ...base,
      conversation_action: "answer_then_continue",
      assistant_response:
        "這沒有固定週期。需要多久，取決於你想改到什麼程度、以及你實際做得到的改變。",
    };
  }
  if (kind === "cost") {
    return {
      ...base,
      conversation_action: "answer_then_continue",
      assistant_response: "這一階段不是在談費用或方案，我現在也沒有要向你收費。",
    };
  }
  if (kind === "how") {
    return {
      ...base,
      conversation_action: "answer_then_continue",
      assistant_response: "我現在還在了解你卡住的方式，不會先丟一套計畫。",
    };
  }
  if (kind === "challenge") {
    return {
      ...base,
      conversation_action: "challenge",
      assistant_response:
        "我問這些，是想弄清楚真正卡住你的是什麼，而不是填一份表。你要我繼續了解，還是先用目前知道的幫你整理？",
    };
  }
  if (currentAnswer.trim().length < 3) {
    return {
      ...base,
      conversation_action: "ask",
      assistant_response: "我好像還沒抓到你真正想說的那一句。用你自己的話講一件最近的事就好。",
    };
  }
  return {
    ...base,
    conversation_action: "reflect",
    assistant_response: "我先把你剛說的放在這一輪的中心，不急著往下盤問。",
    understanding_patch: [],
  };
}

export async function generateNativeInterviewTurn(input: {
  quiz: {
    animalName: string;
    tagline: string;
    headline: string;
    coreInsight: string;
    primaryGoal: string | null;
    readiness: string | null;
    quizPrior?: unknown;
    quizHistory?: Array<{ question: string; selected: string[] }>;
  };
  state: InterviewSessionState;
  currentAnswer: string;
  userTurnId: string;
  userTurnCount: number;
  model: string;
  contractRepair?: { violations: string[]; note: string };
  event?: "quiz_complete";
  consultantVariant?: "current" | "chatgpt";
}): Promise<NativeTurnGeneration> {
  const started = Date.now();
  if (process.env.ANALYSIS_INTERVIEW_FORCE_FAIL === "1") {
    throw new Error("forced_interview_failure");
  }
  if (shouldUseFixture()) {
    return {
      output: buildNativeFixtureTurn(input.currentAnswer),
      model: "fixture",
      latencyMs: Date.now() - started,
      compactContextMs: 0,
      openaiDispatchMs: 0,
      openaiMs: 0,
      parseMs: 0,
      usedFixture: true,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("not_configured");

  const compactStarted = Date.now();
  const chatgpt =
    resolveNativeConsultantVariant(
      input.consultantVariant ??
        (input.state.promptVersion === CHATGPT_CONSULTANT_PROMPT_VERSION ? "chatgpt" : "current"),
    ) === "chatgpt";
  const systemPrompt = chatgpt ? buildChatgptSystemPrompt() : buildNativeSystemPrompt();
  const userPrompt = chatgpt ? buildChatgptUserPrompt(input) : buildNativeUserPrompt(input);
  const compactContextMs = Date.now() - compactStarted;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NATIVE_INTERVIEW_TIMEOUT_MS);
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
        model: input.model,
        temperature: 0.4,
        max_tokens: NATIVE_INTERVIEW_MAX_OUTPUT_TOKENS,
        response_format: {
          type: "json_schema",
          json_schema: NATIVE_INTERVIEW_JSON_SCHEMA,
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    const openaiMs = Date.now() - dispatchStarted;
    if (!response.ok) {
      const text = await response.text();
      logNativeLlmCallNonBlocking({
        feature: "analysis",
        pointKey: chatgpt ? "chatgpt_consultant" : "native_interview",
        customerId: null,
        enrollmentId: null,
        ownerMemberId: null,
        model: input.model,
        promptVersion: chatgpt ? CHATGPT_CONSULTANT_PROMPT_VERSION : NATIVE_INTERVIEW_PROMPT_VERSION,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, imageCount: 0 },
        latencyMs: openaiMs,
        status: "failed",
        errorCode: `http_${response.status}`,
      });
      throw new Error(`OpenAI error ${response.status}: ${text.slice(0, 160)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI content");
    const parseStarted = Date.now();
    const parsed = nativeInterviewTurnSchema.safeParse(JSON.parse(content));
    const parseMs = Date.now() - parseStarted;
    if (!parsed.success) throw new Error(`parse_validation: ${parsed.error.message}`);
    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    const latencyMs = Date.now() - started;
    logNativeLlmCallNonBlocking({
      feature: "analysis",
      pointKey: chatgpt ? "chatgpt_consultant" : "native_interview",
      customerId: null,
      enrollmentId: null,
      ownerMemberId: null,
      model: input.model,
      promptVersion: chatgpt ? CHATGPT_CONSULTANT_PROMPT_VERSION : NATIVE_INTERVIEW_PROMPT_VERSION,
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens: payload.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        imageCount: 0,
      },
      latencyMs,
      status: "completed",
    });
    return {
      output: parsed.data,
      model: input.model,
      latencyMs,
      compactContextMs,
      openaiDispatchMs: dispatchStarted - started,
      openaiMs,
      parseMs,
      usedFixture: false,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
