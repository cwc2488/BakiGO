import { describe, expect, it, vi } from "vitest";
import {
  buildBarrierInsightInputSnapshot,
  buildMotivationInsightInputSnapshot,
  hasMotivationInsightInput,
} from "@/lib/consultation/ai/build-input-snapshot";
import { CONSULTATION_AI_MAX_REGENERATIONS, CONSULTATION_AI_TIMEOUT_MS, CONSULTATION_AI_UNAVAILABLE_MESSAGE } from "@/lib/consultation/ai/constants";
import {
  ConsultationAiConfigurationError,
  createConsultationAiProvider,
  FixtureConsultationAiProvider,
  OpenAiConsultationAiProvider,
} from "@/lib/consultation/ai/provider";
import {
  barrierInsightOpenAiJsonSchema,
  barrierInsightOutputSchema,
  motivationInsightOpenAiJsonSchema,
  motivationInsightOutputSchema,
  parseBarrierInsightOutput,
  parseMotivationInsightOutput,
} from "@/lib/consultation/ai/schema";
import { resolveStep8Outcome } from "@/lib/consultation/consultation-flow-engine";

describe("consultation-ai schema", () => {
  it("accepts valid motivation structured output", () => {
    const payload = {
      coreMotivation: "想更有精神帶小孩",
      motivationSummary: "理由一最強調家庭與日常能量。",
      signals: ["家庭", "日常疲憊"],
      recommendedFollowUpQuestion: "如果精神變好，你最想先多做哪一件事？",
      coachNote: "請以客人原話再確認。",
      confidence: 0.72,
    };
    expect(parseMotivationInsightOutput(payload).ok).toBe(true);
    expect(motivationInsightOutputSchema.parse(payload)).toEqual(payload);
  });

  it("accepts valid barrier structured output", () => {
    const payload = {
      surfaceBarrier: "時間不夠",
      possibleUnderlyingBarrier: "可能與優先順序或過往挫折有關，仍需更多原話。",
      evidence: ["決心 7 分", "提到工作很忙"],
      recommendedQuestion: "如果每天只先留 15 分鐘，你願意從哪裡開始？",
      coachNote: "區分表面阻礙與推測。",
      confidence: 0.61,
    };
    expect(parseBarrierInsightOutput(payload).ok).toBe(true);
    expect(barrierInsightOutputSchema.parse(payload)).toEqual(payload);
  });

  it("rejects malformed motivation output gracefully", () => {
    const result = parseMotivationInsightOutput({
      coreMotivation: "",
      motivationSummary: "x",
      signals: [],
      recommendedFollowUpQuestion: "q",
      coachNote: "n",
      confidence: 2,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects malformed barrier output gracefully", () => {
    const result = parseBarrierInsightOutput({
      surfaceBarrier: "time",
      possibleUnderlyingBarrier: "x",
      evidence: [],
      recommendedQuestion: "q",
      coachNote: "n",
      confidence: -1,
    });
    expect(result.ok).toBe(false);
  });
});

describe("consultation-ai input snapshots", () => {
  it("builds motivation snapshot without PII fields", () => {
    const snapshot = buildMotivationInsightInputSnapshot({
      dataJson: {
        goals: { goalType: "fat_loss" },
        motivations: { reason1: "想穿回舊衣服" },
      },
      bodySummary: { weightKg: 72, bmi: 24.1 },
    });
    expect(snapshot.goal?.goalType).toBe("fat_loss");
    expect(snapshot.motivations?.reason1).toBe("想穿回舊衣服");
    expect(snapshot.bodySummary?.weightKg).toBe(72);
    expect(snapshot).not.toHaveProperty("phone");
    expect(hasMotivationInsightInput(snapshot)).toBe(true);
  });

  it("limits barrier insight to commitment scores 6-9", () => {
    expect(
      buildBarrierInsightInputSnapshot({
        session: { commitmentScore: 5 },
        dataJson: { motivations: { reason1: "健康" } },
      }),
    ).toBeNull();
    expect(
      buildBarrierInsightInputSnapshot({
        session: { commitmentScore: 10 },
        dataJson: {},
      }),
    ).toBeNull();
    expect(
      buildBarrierInsightInputSnapshot({
        session: { commitmentScore: 7 },
        dataJson: { barriers: { barriers: ["time"] } },
        barrierDraft: { barrierNotes: "工作太忙" },
      })?.barriers?.barrierNotes,
    ).toBe("工作太忙");
  });
});

describe("consultation-ai provider", () => {
  it("returns fixture motivation insight that passes schema validation", async () => {
    const provider = new FixtureConsultationAiProvider();
    const result = await provider.generateMotivationInsight({
      motivations: { reason1: "想更有自信" },
      goal: { goalType: "body_recomposition" },
    });
    expect(parseMotivationInsightOutput(result.output).ok).toBe(true);
  });

  it("returns fixture barrier insight that passes schema validation", async () => {
    const provider = new FixtureConsultationAiProvider();
    const result = await provider.generateBarrierInsight({
      commitmentScore: 7,
      barriers: { barriers: ["time"], barrierNotes: "下班太晚" },
    });
    expect(parseBarrierInsightOutput(result.output).ok).toBe(true);
  });

  it("fails fast on malformed OpenAI JSON without blocking callers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "{not-json" } }] }),
      }),
    );

    const provider = new OpenAiConsultationAiProvider("test-key");
    await expect(
      provider.generateMotivationInsight({ motivations: { reason1: "健康" } }),
    ).rejects.toThrow("invalid JSON");

    vi.unstubAllGlobals();
  });

  it("uses OpenAI structured outputs json_schema aligned with Zod", async () => {
    const motivationPayload = {
      coreMotivation: "想更有自信",
      motivationSummary: "理由一最強調自信與外觀。",
      signals: ["自信"],
      recommendedFollowUpQuestion: "如果達成，你最先想穿哪一件衣服？",
      coachNote: "請再確認原話。",
      confidence: 0.6,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(motivationPayload) } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiConsultationAiProvider("test-key");
    const result = await provider.generateMotivationInsight({
      motivations: { reason1: "想更有自信" },
    });

    expect(parseMotivationInsightOutput(result.output).ok).toBe(true);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "motivation_insight",
        strict: true,
        schema: motivationInsightOpenAiJsonSchema,
      },
    });

    vi.unstubAllGlobals();
  });

  it("uses barrier structured output schema for barrier insight calls", async () => {
    const barrierPayload = {
      surfaceBarrier: "時間不夠",
      possibleUnderlyingBarrier: "可能與優先順序有關。",
      evidence: ["決心 7 分"],
      recommendedQuestion: "如果每天 15 分鐘，你願意從哪裡開始？",
      coachNote: "區分表面與推測。",
      confidence: 0.55,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(barrierPayload) } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiConsultationAiProvider("test-key");
    await provider.generateBarrierInsight({
      commitmentScore: 7,
      barriers: { barriers: ["time"] },
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.response_format.json_schema).toEqual({
      name: "barrier_insight",
      strict: true,
      schema: barrierInsightOpenAiJsonSchema,
    });

    vi.unstubAllGlobals();
  });

  it("uses configured upstream timeout budget", () => {
    expect(CONSULTATION_AI_TIMEOUT_MS).toBe(15_000);
  });

  it("does not use fixture provider in production without OPENAI_API_KEY", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENAI_API_KEY", "");

    expect(() => createConsultationAiProvider()).toThrow(ConsultationAiConfigurationError);
    expect(() => createConsultationAiProvider()).toThrow(CONSULTATION_AI_UNAVAILABLE_MESSAGE);

    vi.unstubAllEnvs();
  });
});

describe("consultation-ai regenerate policy", () => {
  it("caps regeneration attempts at configured maximum", () => {
    expect(CONSULTATION_AI_MAX_REGENERATIONS).toBe(3);
  });
});

describe("consultation-ai does not change commitment gate", () => {
  it("keeps step 8 routing in flow engine", () => {
    expect(
      resolveStep8Outcome({
        commitmentScore: 7,
        readyIfBarrierSolved: true,
      }),
    ).toEqual({ type: "advance_to_step_9" });

    expect(
      resolveStep8Outcome({
        commitmentScore: 4,
      }),
    ).toEqual({ type: "not_ready" });
  });
});
