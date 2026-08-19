import { after } from "next/server";
import {
  DYNAMIC_QUIZ_BOUNDS,
  DYNAMIC_QUIZ_JSON_SCHEMA,
  DYNAMIC_QUIZ_MAX_OUTPUT_TOKENS,
  DYNAMIC_QUIZ_PROMPT_VERSION,
  DYNAMIC_QUIZ_TIMEOUT_MS,
  quizClaim,
  quizTurnOutputSchema,
  type DynamicQuizState,
  type QuizPrior,
  type QuizTurnOutput,
  type QuizUnderstanding,
} from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";
import {
  buildDynamicQuizSystemPrompt,
  buildDynamicQuizUserPrompt,
} from "@/lib/analysis/dynamic-quiz/dynamic-quiz-prompts";
import { ensureQuizPriorHypotheses } from "@/lib/analysis/dynamic-quiz/quiz-prior-lifecycle";
import { logLlmCall } from "@/lib/ai/llm-telemetry";

export type QuizGeneration = {
  output: QuizTurnOutput;
  latencyMs: number;
  openaiMs: number;
  usedFixture: boolean;
  inputTokens: number;
  outputTokens: number;
};

function shouldUseFixture(): boolean {
  if (process.env.ANALYSIS_AI_USE_FIXTURE === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

function withDecision(
  output: Omit<
    QuizTurnOutput,
    | "decision"
    | "why_next_question"
    | "last_answer_added"
    | "remaining_uncertainty"
    | "material_change_targets"
    | "information_gain"
  > &
    Partial<
      Pick<
        QuizTurnOutput,
        | "decision"
        | "why_next_question"
        | "last_answer_added"
        | "remaining_uncertainty"
        | "material_change_targets"
        | "information_gain"
      >
    >,
  latest: string[],
  asking: boolean,
): QuizTurnOutput {
  return {
    ...output,
    decision: output.decision ?? (asking ? "continue" : "complete"),
    why_next_question: asking ? output.why_next_question ?? "分辨目前最接近的卡點或動機" : "",
    last_answer_added: output.last_answer_added ?? latest.join("、"),
    remaining_uncertainty: asking ? output.remaining_uncertainty ?? "動機或卡點仍可能有競爭解釋" : "",
    material_change_targets: asking ? output.material_change_targets ?? ["motivation", "barrier"] : [],
    information_gain: output.information_gain ?? {
      target: asking ? "分辨動機或卡點" : "",
      plausible_answers: asking ? ["解釋 A", "解釋 B"] : [],
      material_change: asking,
      change_dimensions: asking ? ["motivation"] : [],
      short_rationale: asking ? "不同答案會改變理解" : "no material change",
    },
  };
}

/**
 * Test fixture. Branches on the latest selected labels so unit tests can
 * prove the next question changes. This is NOT the production question bank.
 */
export function buildDynamicQuizFixture(input: {
  asked: Array<{ question: string; selected: string[] }>;
  latestSelected: string[];
  answeredCount: number;
  min: number;
}): QuizTurnOutput {
  const latest = input.latestSelected.join(" ");
  const history = input.asked.map((a) => a.selected.join(" ")).join(" ");
  const all = `${history} ${latest}`;
  const contradiction = /其實不是|搞錯了|我講錯|不是衣服|不是醫生/.test(latest);
  const lowReady = /沒有很急|不確定|說不上來|朋友叫我/.test(all);
  const medical = /醫生|健檢|紅字|血糖/.test(all);
  const clothes = /衣服|穿/.test(all) && !/其實不是衣服/.test(all);
  const partner = /身邊的人|另一半|女朋友|男友|分手/.test(all);
  const busy = /工作|沒時間|太忙/.test(all);
  const food = /愛吃|不想戒|喜歡吃/.test(all);
  const rebound = /復胖|胖回來|又胖/.test(all);

  const understanding: QuizUnderstanding = {
    observed_signals: input.latestSelected.slice(0, 4),
    provisional_motivations: clothes
      ? ["穿衣服的感覺"]
      : medical
        ? ["健康提醒"]
        : partner
          ? ["外在壓力"]
          : ["想改變體態"],
    possible_barriers: food ? ["不想放棄喜歡的食物"] : busy ? ["時間"] : rebound ? ["怕再失敗"] : [],
    possible_tradeoffs: food ? ["吃的自由 vs 體態"] : [],
    confidence: contradiction ? "low" : input.answeredCount >= 6 ? "medium" : "low",
    contradictions: contradiction ? ["最新答案修正了前面的假設"] : [],
    unresolved_hypotheses: lowReady ? ["動機可能不夠強"] : [],
  };

  const motivation = quizClaim(
    clothes ? "在意穿衣服的感覺" : medical ? "健康提醒觸發" : partner ? "他人期待" : "想改變體態",
    contradiction || lowReady ? "low" : "medium",
    input.latestSelected,
    "motivation",
    "h_mot_1",
    contradiction ? "weakened" : "active",
  );
  const barriers = food
    ? [quizClaim("不想犧牲愛吃的東西", "medium", input.latestSelected, "barrier", "h_bar_1")]
    : busy
      ? [quizClaim("生活很滿，時間不好排", "medium", input.latestSelected, "barrier", "h_bar_1")]
      : rebound
        ? [quizClaim("怕瘦完又回來", "medium", input.latestSelected, "barrier", "h_bar_1")]
        : [];
  const tradeoffs = food
    ? [quizClaim("吃的滿足 vs 穿衣自信", "medium", input.latestSelected, "tradeoff", "h_trd_1")]
    : [];
  const patterns = rebound
    ? [quizClaim("衝一波後難維持", "low", input.latestSelected, "behavior_pattern", "h_pat_1")]
    : [];

  const prior: QuizPrior = ensureQuizPriorHypotheses({
    unverified: true,
    likely_primary_motivation: motivation,
    likely_barriers: barriers,
    possible_tradeoffs: tradeoffs,
    possible_behavior_pattern: patterns,
    confidence: {
      overall: contradiction || lowReady ? "low" : "medium",
      motivation: lowReady ? "low" : "medium",
      barrier: food || busy || rebound ? "medium" : "low",
    },
    contradictions: understanding.contradictions,
    unresolved: understanding.unresolved_hypotheses,
    evidence: input.asked.map((a) => `${a.question} → ${a.selected.join("、")}`).slice(-8),
    hypotheses: [motivation, ...barriers, ...tradeoffs, ...patterns],
  });

  if (input.answeredCount >= input.min) {
    return withDecision(
      {
        action: "complete",
        question: "",
        type: "single_choice",
        options: [],
        reasoning_tag: "enough_information",
        hypothesis_targets: [],
        understanding,
        quiz_prior: prior,
      },
      input.latestSelected,
      false,
    );
  }

  let question = "目前最接近你狀況的是哪一種？";
  let options = [
    { id: "a", label: "想改變，但還說不太清楚卡在哪" },
    { id: "b", label: "其實沒有很急" },
    { id: "c", label: "我知道問題，只是還沒開始" },
    { id: "d", label: "開始過，可是沒持續" },
  ];
  let tag = "generic_followup";
  let why = "分辨準備度與是否已有明確卡點";
  let targets: QuizTurnOutput["material_change_targets"] = ["readiness", "barrier"];

  if (medical) {
    question = "醫生或檢查提醒之後，你自己現在最在意的是哪一件？";
    options = [
      { id: "m1", label: "我自己也開始覺得身體不對勁" },
      { id: "m2", label: "主要是被提醒，自己還沒那麼急" },
      { id: "m3", label: "想先把生活作息調穩一點" },
      { id: "m4", label: "還不確定要不要為這件事大改" },
    ];
    tag = "medical_trigger_not_diagnosis";
    why = "分辨健康提醒是外在觸發還是自己也在意";
    targets = ["motivation", "readiness"];
  } else if (clothes) {
    question = "你說衣服開始不好看，最接近你的情況是哪一種？";
    options = [
      { id: "c1", label: "買衣服時很難找到想穿的" },
      { id: "c2", label: "以前的衣服穿不下" },
      { id: "c3", label: "穿得下，但照鏡子不好看" },
      { id: "c4", label: "拍照時特別明顯" },
      { id: "c5", label: "其實不是衣服，是整體沒自信" },
    ];
    tag = "clothes_specificity";
    why = "分辨穿衣困擾是尺寸、自我形象，還是別的動機";
    targets = ["motivation", "competing_hypothesis"];
  } else if (partner) {
    question = "別人叫你減肥這件事，對你來說比較像哪一種？";
    options = [
      { id: "p1", label: "我自己其實也想改，只是被說了才認真" },
      { id: "p2", label: "主要是怕對方不高興或離開" },
      { id: "p3", label: "被念很煩，自己沒那麼想動" },
      { id: "p4", label: "有點受傷，但也開始正視自己的身體" },
    ];
    tag = "external_vs_personal";
    why = "分辨外在壓力與自己想改是否同一件事";
    targets = ["motivation", "competing_hypothesis"];
  } else if (busy) {
    question = "工作或生活很滿的時候，最難的是哪一段？";
    options = [
      { id: "b1", label: "真的擠不出連續時間" },
      { id: "b2", label: "不是沒時間，是不知道吃什麼" },
      { id: "b3", label: "一累就想用吃的撐過去" },
      { id: "b4", label: "計畫一被打亂就整週放棄" },
    ];
    tag = "busy_not_just_time";
    why = "分辨卡點是時間、不知道吃什麼，還是一亂就放棄";
    targets = ["barrier", "behavior_pattern"];
  } else if (food) {
    question = "你不想放棄喜歡吃的東西，目前比較接近哪一種？";
    options = [
      { id: "f1", label: "可以少一點，但不想完全戒" },
      { id: "f2", label: "一限制就更容易反彈大吃" },
      { id: "f3", label: "吃對我來說是紓壓，不只是餓" },
      { id: "f4", label: "其實還不知道自己能不能少吃" },
    ];
    tag = "food_tradeoff";
    why = "分辨食物卡點是取捨、反彈，還是紓壓";
    targets = ["tradeoff", "barrier"];
  } else if (rebound) {
    question = "以前瘦過又回來之後，你現在最在意的是？";
    options = [
      { id: "r1", label: "怕這次又失敗" },
      { id: "r2", label: "不想再用太狠的方法" },
      { id: "r3", label: "不知道當初為什麼維持不住" },
      { id: "r4", label: "想改，但還沒準備好再開始" },
    ];
    tag = "rebound_fear";
    why = "分辨復胖後的主因是怕失敗、方法太狠，還是準備度";
    targets = ["barrier", "readiness"];
  } else if (lowReady) {
    question = "如果現在完全不改，你自己覺得怎麼樣？";
    options = [
      { id: "l1", label: "其實還可以，沒到非改不可" },
      { id: "l2", label: "有一點在意，但不想弄得很辛苦" },
      { id: "l3", label: "說不上來，就是有人叫我來看看" },
      { id: "l4", label: "還是想弄清楚自己到底在不在意" },
    ];
    tag = "readiness";
    why = "分辨低動機是真的不急，還是還沒說清楚";
    targets = ["readiness", "motivation"];
  } else if (contradiction) {
    question = "你剛修正了前面的說法，現在最接近真實的是？";
    options = [
      { id: "x1", label: "前面選太快，現在這句才準" },
      { id: "x2", label: "兩邊都有，只是剛剛那個比較不是重點" },
      { id: "x3", label: "我還是有點混亂，說不清楚" },
      { id: "x4", label: "其實沒有很想改，只是在配合" },
    ];
    tag = "contradiction_update";
    why = "讓最新修正取得假設權威，而不是兩說並列";
    targets = ["competing_hypothesis", "motivation"];
  }

  return withDecision(
    {
      action: "ask",
      why_next_question: why,
      remaining_uncertainty: why,
      material_change_targets: targets,
      question,
      type: "single_choice",
      options,
      reasoning_tag: tag,
      hypothesis_targets: ["motivation", "barrier"],
      understanding,
      quiz_prior: prior,
    },
    input.latestSelected,
    true,
  );
}

function logQuizLlm(entry: Parameters<typeof logLlmCall>[0]): void {
  const run = () => {
    void logLlmCall(entry).catch(() => undefined);
  };
  try {
    after(run);
  } catch {
    run();
  }
}

export async function generateDynamicQuizTurn(input: {
  state: DynamicQuizState;
  icebreaker: {
    animalName: string;
    tagline: string;
    coreInsight: string;
    source?: "personality_quiz" | "native_opener";
  };
  latestSelected: string[];
  repair?: { violations: string[]; note: string };
}): Promise<QuizGeneration> {
  const started = Date.now();
  const asked = input.state.asked.map((q) => ({ question: q.question, selected: q.selectedLabels }));
  if (shouldUseFixture()) {
    return {
      output: buildDynamicQuizFixture({
        asked,
        latestSelected: input.latestSelected,
        answeredCount: input.state.asked.length,
        min: DYNAMIC_QUIZ_BOUNDS.min,
      }),
      latencyMs: Date.now() - started,
      openaiMs: 0,
      usedFixture: true,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DYNAMIC_QUIZ_TIMEOUT_MS);
  const openaiStarted = Date.now();
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.state.model,
        temperature: 0.6,
        max_tokens: DYNAMIC_QUIZ_MAX_OUTPUT_TOKENS,
        response_format: { type: "json_schema", json_schema: DYNAMIC_QUIZ_JSON_SCHEMA },
        messages: [
          { role: "system", content: buildDynamicQuizSystemPrompt() },
          {
            role: "user",
            content: buildDynamicQuizUserPrompt({
              icebreaker: input.icebreaker,
              asked,
              askedIntents: input.state.asked.map((q) => ({
                question: q.question,
                target: q.informationGain?.target ?? "",
                hypothesis_targets: q.hypothesis_targets ?? [],
              })),
              latestSelected: input.latestSelected,
              understanding: input.state.understanding,
              answeredCount: input.state.asked.length,
              min: DYNAMIC_QUIZ_BOUNDS.min,
              hardMax: DYNAMIC_QUIZ_BOUNDS.hardMax,
              preferCompleteFrom: DYNAMIC_QUIZ_BOUNDS.preferCompleteFrom,
              repair: input.repair,
            }),
          },
        ],
      }),
    });
    const openaiMs = Date.now() - openaiStarted;
    if (!response.ok) {
      const text = await response.text();
      logQuizLlm({
        feature: "analysis",
        pointKey: "dynamic_quiz",
        customerId: null,
        enrollmentId: null,
        ownerMemberId: null,
        model: input.state.model,
        promptVersion: DYNAMIC_QUIZ_PROMPT_VERSION,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, imageCount: 0 },
        latencyMs: Date.now() - started,
        status: "failed",
        errorCode: `http_${response.status}`,
        inputFingerprint: "dynamic_quiz",
      });
      throw new Error(`OpenAI error ${response.status}: ${text.slice(0, 200)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const parsed = quizTurnOutputSchema.parse(JSON.parse(String(payload.choices?.[0]?.message?.content || "{}")));
    logQuizLlm({
      feature: "analysis",
      pointKey: "dynamic_quiz",
      customerId: null,
      enrollmentId: null,
      ownerMemberId: null,
      model: input.state.model,
      promptVersion: DYNAMIC_QUIZ_PROMPT_VERSION,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
        cachedInputTokens: 0,
        imageCount: 0,
      },
      latencyMs: Date.now() - started,
      status: "completed",
      errorCode: null,
      inputFingerprint: "dynamic_quiz",
    });
    return {
      output: parsed,
      latencyMs: Date.now() - started,
      openaiMs,
      usedFixture: false,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}
