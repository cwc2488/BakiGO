import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RESET_QUIZ_QUESTIONS, scoreResetQuiz } from "@/lib/analysis/reset/reset-quiz";
import { RESET_ANIMAL_COPY } from "@/lib/analysis/reset/reset-animals";
import { RESET_CHARACTER_THEME } from "@/lib/analysis/reset/reset-art";
import {
  RESET_CONVERSATION_PRESENTATION_INSTRUCTION,
  RESET_CONVERSATION_REASONING_PROMPT,
  RESET_REPORT_REASONING_PROMPT,
  buildResetConversationSystemPrompt,
  buildResetReportSystemPrompt,
} from "@/lib/analysis/reset/reset-prompts";
import { RESET_REPORT_TITLES } from "@/lib/analysis/reset/reset-report";
import { isProductionRuntime } from "@/lib/analysis/interview/native/native-path";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("ART-01 feminine consumer art freeze", () => {
  it("does not change quiz copy, scoring, or animal taxonomy", () => {
    expect(RESET_QUIZ_QUESTIONS).toHaveLength(6);
    expect(RESET_QUIZ_QUESTIONS.map((q) => q.text)).toEqual([
      "你原本打算今天好好顧一下自己的體態，但忙了一整天，終於有自己的時間。這時候，你通常會怎麼做？",
      "某天你突然很想把體態顧好，接下來你最可能怎麼做？",
      "你已經認真控制一週，結果今晚真的吃爆了。隔天早上，你腦中最容易出現哪一句？",
      "你努力了一陣子，但成果突然停住了。你的第一反應比較像？",
      "假設你已經決定這個月要認真改變，但突然進入非常忙的兩週，你最可能？",
      "如果有人看完你過去幾次想改變體態的過程，你最怕他對你說哪一句？",
    ]);
    const scored = scoreResetQuiz(
      RESET_QUIZ_QUESTIONS.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
    );
    expect(Object.keys(RESET_ANIMAL_COPY)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(RESET_ANIMAL_COPY[scored.winner].animalName).toBeTruthy();
    expect(Object.keys(RESET_CHARACTER_THEME)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("leaves AI core and presentation instruction frozen", () => {
    expect(buildResetConversationSystemPrompt()).toBe(RESET_CONVERSATION_REASONING_PROMPT);
    expect(RESET_CONVERSATION_PRESENTATION_INSTRUCTION).toContain("PRESENTATION INSTRUCTION ONLY");
    expect(buildResetReportSystemPrompt()).toBe(RESET_REPORT_REASONING_PROMPT);
    expect(RESET_REPORT_TITLES).toHaveLength(3);
    expect(src("src/lib/analysis/reset/reset-engine.ts")).toContain("temperature: 0.7");
    expect(src("src/lib/analysis/reset/reset-path.ts")).toContain('RESET_MODEL = "gpt-4.1"');
  });

  it("uses cream art direction without Production or Coaching changes", () => {
    expect(isProductionRuntime()).toBe(false);
    expect(src("src/app/globals.css")).toContain("--rx-bg: #fff9f5");
    expect(src("src/components/reset/ResetShell.tsx")).toContain('data-art="design-board"');
    expect(src("src/app/quiz/fat-loss/page.tsx")).toContain("ResetLandingPage");
    expect(src("src/lib/coaching/coaching-service.ts")).not.toContain("experience_21d_interests");
    expect(src("src/components/reset/ResetVisualStories.tsx")).toContain("reveal-panda");
  });
});
