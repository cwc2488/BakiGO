import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderResetEmphasisHtml } from "@/lib/analysis/reset/reset-emphasis";
import { RESET_QUIZ_QUESTIONS } from "@/lib/analysis/reset/reset-quiz";
import {
  RESET_CONVERSATION_PRESENTATION_INSTRUCTION,
  RESET_CONVERSATION_REASONING_PROMPT,
  RESET_REPORT_REASONING_PROMPT,
  buildResetConversationSystemPrompt,
  buildResetReportSystemPrompt,
} from "@/lib/analysis/reset/reset-prompts";
import { RESET_OPENING } from "@/lib/analysis/reset/reset-path";
import { RESET_COMPOSER_PLACEHOLDER } from "@/lib/analysis/reset/reset-animals";
import { RESET_REPORT_TITLES } from "@/lib/analysis/reset/reset-report";
import { looksLikeUserMedicalContext, stripGoalOverride } from "@/lib/analysis/reset/reset-safety";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("RESET-VISUAL-01 presentation freeze", () => {
  it("keeps the frozen 6-question quiz with no GPT generation", () => {
    expect(RESET_QUIZ_QUESTIONS).toHaveLength(6);
    expect(RESET_QUIZ_QUESTIONS[0]!.text).toBe(
      "你原本打算今天好好顧一下自己的體態，但忙了一整天，終於有自己的時間。這時候，你通常會怎麼做？",
    );
    expect(src("src/lib/analysis/reset/reset-quiz.ts")).not.toMatch(/openai|gpt-4/i);
    expect(src("src/components/reset/ResetExperienceViews.tsx")).not.toMatch(/AI 分析中|63%|動態思考/);
  });

  it("does not change conversation reasoning, model contract, or medical safety", () => {
    expect(buildResetConversationSystemPrompt()).toBe(RESET_CONVERSATION_REASONING_PROMPT);
    expect(buildResetConversationSystemPrompt()).not.toContain("PRESENTATION INSTRUCTION");
    expect(RESET_CONVERSATION_PRESENTATION_INSTRUCTION).toContain("PRESENTATION INSTRUCTION ONLY");
    expect(RESET_CONVERSATION_PRESENTATION_INSTRUCTION).toContain("does not change reasoning");
    expect(src("src/lib/analysis/reset/reset-engine.ts")).toContain("RESET_CONVERSATION_PRESENTATION_INSTRUCTION");
    expect(src("src/lib/analysis/reset/reset-engine.ts")).toContain('model: RESET_MODEL');
    expect(src("src/lib/analysis/reset/reset-engine.ts")).toContain("temperature: 0.7");
    expect(src("src/lib/analysis/reset/reset-path.ts")).toContain('RESET_MODEL = "gpt-4.1"');
    expect(looksLikeUserMedicalContext("我血糖紅字")).toBe(true);
    expect(stripGoalOverride("你其實不用減了啦。還可以聊聊。")).not.toMatch(/你其實不用減/);
  });

  it("does not change report reasoning contract and keeps three sections", () => {
    expect(buildResetReportSystemPrompt()).toBe(RESET_REPORT_REASONING_PROMPT);
    expect(RESET_REPORT_TITLES).toEqual([
      "我真正看見你卡住的是什麼？",
      "為什麼以前的方法容易失敗？",
      "現在最值得先改哪一件事？",
    ]);
    expect(src("src/components/reset/ResetExperienceViews.tsx")).not.toContain("section4");
    expect(src("src/lib/analysis/reset/reset-report.ts")).toContain("why_now");
    expect(src("src/lib/analysis/reset/reset-report.ts")).toContain("bottleneck");
    expect(src("src/lib/analysis/reset/reset-report.ts")).toContain("first_change");
  });

  it("renders the first AI question as a message, not a composer-only state", () => {
    const ui = src("src/components/reset/ResetExperienceViews.tsx");
    expect(ui).toContain("RESET_OPENING");
    expect(ui).toContain("conversationTurns");
    expect(RESET_OPENING).toBe("你最近為什麼會開始想改變自己的體態？");
    expect(RESET_COMPOSER_PLACEHOLDER).toBe("直接跟我說就好…");
    expect(ui).not.toContain("用你自己的話說");
    expect(src("src/components/reset/ResetExperiencePage.tsx")).not.toContain("用你自己的話說");
  });

  it("safely renders paired **insight** and escapes HTML", () => {
    const html = renderResetEmphasisHtml(
      "前文。\n\n**真正卡住的是疲勞出現時的選擇。**\n\n后文。<script>alert(1)</script> **ok**",
    );
    expect(html).toContain("<strong>真正卡住的是疲勞出現時的選擇。</strong>");
    expect(html).toContain("<strong>ok</strong>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/\*\*真正卡住/);
    expect(src("src/components/reset/ResetExperienceViews.tsx")).toContain("ResetRichText");
  });

  it("renders landing as full key visual with transparent start hit", () => {
    const landing = src("src/components/reset/ResetExperienceViews.tsx").split("export function ResetQuizView")[0]!;
    expect(landing).toContain("/reset/landing-final.png");
    expect(landing).toContain("rx-kv-hit");
    expect(landing).toContain("開始測驗");
    expect(landing).toContain("準備測驗中…");
    expect(landing.indexOf("rx-kv-hit")).toBeGreaterThan(landing.indexOf("/reset/landing-final.png"));
    expect(landing).not.toContain("rx-land-cta");
  });

  it("keeps visual harness and Coaching 037 isolated", () => {
    expect(src("src/app/quiz/fat-loss/page.tsx")).toContain("ResetLandingPage");
    expect(src("src/app/quiz/fat-loss/page.tsx")).not.toContain("useLegacyTwelveQuestion");
    expect(src("src/app/analysis/reset-visual/page.tsx")).toContain("notFound()");
    expect(src("src/lib/coaching/coaching-service.ts")).not.toContain("experience_21d_interests");
    expect(src("src/app/quiz/fat-loss/layout.tsx")).not.toMatch(/12 題測出你的減脂卡關人格/);
    expect(src("src/lib/quiz/fat-loss/public-metadata.ts")).toContain("12題");
    const harness = src("src/components/reset/ResetVisualStories.tsx");
    expect(harness).toContain("ResetLandingView");
    expect(harness).toContain("quiz-q1");
    expect(harness).toContain("quiz-selected");
    expect(harness).toContain("reveal-([a-f])");
    expect(harness).toContain("chat-first");
    expect(harness).toContain("chat-think");
    expect(harness).toContain("chat-bold");
    expect(harness).toContain("chat-multi");
    expect(harness).toContain("chat-long");
    expect(harness).toContain("report");
    expect(harness).toContain("report-21d");
  });
});
