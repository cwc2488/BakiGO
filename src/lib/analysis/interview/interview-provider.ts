import { after } from "next/server";
import {
  ANALYSIS_INTERVIEW_MAX_OUTPUT_TOKENS,
  ANALYSIS_INTERVIEW_MODEL_ID,
  ANALYSIS_INTERVIEW_PROMPT_VERSION,
  ANALYSIS_INTERVIEW_TIMEOUT_MS,
  INTERVIEW_AI_JSON_SCHEMA,
  interviewAiTurnSchema,
  type InterviewAiTurn,
  type InterviewSessionState,
} from "@/lib/analysis/interview/interview-contract";
import { buildInterviewFixtureTurn } from "@/lib/analysis/interview/interview-fixture";
import { buildInterviewSystemPrompt, buildInterviewUserPrompt } from "@/lib/analysis/interview/interview-prompts";
import { logLlmCall } from "@/lib/ai/llm-telemetry";

export type InterviewTurnGeneration = {
  output: InterviewAiTurn;
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

function shouldForceFail(): boolean {
  return process.env.ANALYSIS_INTERVIEW_FORCE_FAIL === "1";
}

function logInterviewLlmCallNonBlocking(entry: Parameters<typeof logLlmCall>[0]): void {
  const run = () => {
    void logLlmCall(entry).catch(() => undefined);
  };
  try {
    after(run);
  } catch {
    run();
  }
}

export async function generateInterviewTurn(input: {
  quiz: {
    animalName: string;
    tagline: string;
    headline: string;
    coreInsight: string;
    primaryGoal: string | null;
    readiness: string | null;
  };
  state: InterviewSessionState;
  previousQuestion: string;
  currentAnswer: string;
  userTurnId: string;
  userTurnCount: number;
  contractRepair?: { violations: string[]; note: string };
}): Promise<InterviewTurnGeneration> {
  const started = Date.now();
  if (shouldForceFail()) {
    throw new Error("forced_interview_failure");
  }
  if (shouldUseFixture()) {
    return {
      output: buildInterviewFixtureTurn({
        state: input.state,
        currentAnswer: input.currentAnswer,
        userTurnId: input.userTurnId,
      }),
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

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("not_configured");
  }

  const compactStarted = Date.now();
  const systemPrompt = buildInterviewSystemPrompt();
  const userPrompt = buildInterviewUserPrompt(input);
  const compactContextMs = Date.now() - compactStarted;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_INTERVIEW_TIMEOUT_MS);
  const dispatchStarted = Date.now();
  const openaiDispatchMs = dispatchStarted - started;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: ANALYSIS_INTERVIEW_MODEL_ID,
        temperature: 0.4,
        max_tokens: ANALYSIS_INTERVIEW_MAX_OUTPUT_TOKENS,
        response_format: {
          type: "json_schema",
          json_schema: INTERVIEW_AI_JSON_SCHEMA,
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
      logInterviewLlmCallNonBlocking({
        feature: "analysis",
        pointKey: "contextual_interview",
        customerId: null,
        enrollmentId: null,
        ownerMemberId: null,
        model: ANALYSIS_INTERVIEW_MODEL_ID,
        promptVersion: ANALYSIS_INTERVIEW_PROMPT_VERSION,
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
    const parsed = interviewAiTurnSchema.safeParse(JSON.parse(content));
    const parseMs = Date.now() - parseStarted;
    if (!parsed.success) throw new Error(`parse_validation: ${parsed.error.message}`);
    const latencyMs = Date.now() - started;

    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    logInterviewLlmCallNonBlocking({
      feature: "analysis",
      pointKey: "contextual_interview",
      customerId: null,
      enrollmentId: null,
      ownerMemberId: null,
      model: ANALYSIS_INTERVIEW_MODEL_ID,
      promptVersion: ANALYSIS_INTERVIEW_PROMPT_VERSION,
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
      model: ANALYSIS_INTERVIEW_MODEL_ID,
      latencyMs,
      compactContextMs,
      openaiDispatchMs,
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
