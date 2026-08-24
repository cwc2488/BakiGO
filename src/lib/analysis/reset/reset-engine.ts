import { z } from "zod";
import {
  RESET_CONVERSATION_PROMPT_VERSION,
  RESET_HARD_MAX_TURNS,
  RESET_MAX_OUTPUT_TOKENS,
  RESET_MIN_TURNS_BEFORE_CLOSE,
  RESET_MODEL,
  RESET_TIMEOUT_MS,
} from "@/lib/analysis/reset/reset-path";
import {
  RESET_CONVERSATION_PRESENTATION_INSTRUCTION,
  buildResetConversationSystemPrompt,
  buildResetConversationUserPrompt,
} from "@/lib/analysis/reset/reset-prompts";
import {
  emptyPrivateReasoning,
  type ResetConversationState,
  type ResetPrivateReasoning,
  type ResetTurn,
} from "@/lib/analysis/reset/reset-contract";
import {
  hasUnsafeMedicalCoaching,
  looksLikeUserMedicalContext,
  MEDICAL_GUIDANCE,
  stripGoalOverride,
  stripUnsafeMedicalCopy,
} from "@/lib/analysis/reset/reset-safety";

const privateSchema = z.object({
  current_hypothesis: z.string().max(320).default(""),
  evidence_for: z.array(z.string().max(180)).max(6).default([]),
  evidence_against: z.array(z.string().max(180)).max(6).default([]),
  what_changed: z.string().max(240).default(""),
  unresolved_core_question: z.string().max(200).default(""),
  ready_to_close: z.boolean().default(false),
});

const turnSchema = z.object({
  visible_response: z.string().min(1).max(1600),
  private: privateSchema.optional(),
});

export const RESET_TURN_JSON_SCHEMA = {
  name: "reset_conversation_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["visible_response", "private"],
    properties: {
      visible_response: { type: "string" },
      private: {
        type: "object",
        additionalProperties: false,
        required: [
          "current_hypothesis",
          "evidence_for",
          "evidence_against",
          "what_changed",
          "unresolved_core_question",
          "ready_to_close",
        ],
        properties: {
          current_hypothesis: { type: "string" },
          evidence_for: { type: "array", items: { type: "string" } },
          evidence_against: { type: "array", items: { type: "string" } },
          what_changed: { type: "string" },
          unresolved_core_question: { type: "string" },
          ready_to_close: { type: "boolean" },
        },
      },
    },
  },
} as const;

function shouldUseFixture(): boolean {
  if (process.env.ANALYSIS_AI_USE_FIXTURE === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

function fixtureTurn(answer: string): z.infer<typeof turnSchema> {
  const medical = looksLikeUserMedicalContext(answer);
  return {
    visible_response: medical
      ? "醫療的事我不會幫你下判斷。你剛說的那些，我先當背景，不拿來解釋成病因。"
      : "我先不把這句當成結論。我想看它跟你真正想改變的原因，是不是同一件事。",
    private: {
      ...emptyPrivateReasoning(),
      current_hypothesis: "surface statement; wait for more turns",
      what_changed: answer.slice(0, 80),
      ready_to_close: false,
    },
  };
}

export async function generateResetConversationTurn(input: {
  transcript: ResetTurn[];
  currentAnswer: string;
  compactQuizBackground: string;
  previousPrivate: ResetPrivateReasoning | null;
}): Promise<{
  visible: string;
  private: ResetPrivateReasoning;
  inputTokens: number;
  outputTokens: number;
  openaiMs: number;
  usedFixture: boolean;
}> {
  if (shouldUseFixture()) {
    const fixture = fixtureTurn(input.currentAnswer);
    return {
      visible: fixture.visible_response,
      private: { ...emptyPrivateReasoning(), ...fixture.private },
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
        temperature: 0.7,
        max_tokens: RESET_MAX_OUTPUT_TOKENS,
        response_format: { type: "json_schema", json_schema: RESET_TURN_JSON_SCHEMA },
        messages: [
          { role: "system", content: buildResetConversationSystemPrompt() },
          { role: "system", content: RESET_CONVERSATION_PRESENTATION_INSTRUCTION },
          {
            role: "user",
            content: buildResetConversationUserPrompt({
              transcript: input.transcript.map((t) => ({ role: t.role, text: t.text })),
              currentAnswer: input.currentAnswer,
              compactQuizBackground: input.compactQuizBackground,
              previousPrivate: input.previousPrivate,
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
    const parsed = turnSchema.safeParse(JSON.parse(payload.choices?.[0]?.message?.content || "{}"));
    if (!parsed.success) throw new Error("parse_failed");
    return {
      visible: parsed.data.visible_response.trim(),
      private: { ...emptyPrivateReasoning(), ...parsed.data.private },
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
      openaiMs,
      usedFixture: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function processResetConversationAnswer(input: {
  conversation: ResetConversationState;
  value: string;
  compactQuizBackground: string;
}): Promise<{
  conversation: ResetConversationState;
  medical: boolean;
  inputTokens: number;
  outputTokens: number;
  openaiMs: number;
}> {
  const text = input.value.trim();
  if (!text) throw new Error("invalid_answer:請用一句話回答。");
  if (text.length > 400) throw new Error("invalid_answer:請控制在 400 字以內。");

  const userTurn: ResetTurn = {
    id: `u_${input.conversation.userTurnCount + 1}`,
    role: "user",
    text,
    createdAt: new Date().toISOString(),
  };
  const transcript = [...input.conversation.turns, userTurn];
  const generated = await generateResetConversationTurn({
    transcript,
    currentAnswer: text,
    compactQuizBackground: input.compactQuizBackground,
    previousPrivate: input.conversation.private,
  });

  let visible = generated.visible;
  if (hasUnsafeMedicalCoaching(visible)) visible = stripUnsafeMedicalCopy(visible);
  visible = stripGoalOverride(visible);
  if (!visible) visible = "我先把你剛說的聽進去。你可以用自己的話再講一次。";

  const assistantTurn: ResetTurn = {
    id: `a_${input.conversation.userTurnCount + 1}`,
    role: "assistant",
    text: visible,
    createdAt: new Date().toISOString(),
  };
  const userTurnCount = input.conversation.userTurnCount + 1;
  const atHardMax = userTurnCount >= RESET_HARD_MAX_TURNS;
  const modelClose =
    userTurnCount >= RESET_MIN_TURNS_BEFORE_CLOSE && generated.private.ready_to_close;
  const complete = atHardMax || modelClose;
  const medical = looksLikeUserMedicalContext(text);

  return {
    medical,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
    openaiMs: generated.openaiMs,
    conversation: {
      turns: [...transcript, assistantTurn],
      private: generated.private,
      userTurnCount,
      complete,
      completionReason: complete ? (atHardMax ? "hard_max" : "model_close") : null,
    },
  };
}

export const RESET_MEDICAL_GUIDANCE = MEDICAL_GUIDANCE;
void RESET_CONVERSATION_PROMPT_VERSION;
void RESET_MODEL;
