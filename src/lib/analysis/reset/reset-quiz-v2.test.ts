import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RESET_ANIMAL_COPY, RESET_ANIMAL_MECHANISM, RESET_ANIMAL_PERSONALITY } from "@/lib/analysis/reset/reset-animals";
import {
  RESET_QUIZ_QUESTIONS,
  RESET_QUIZ_TYPES,
  RESET_QUIZ_V2_MATRIX,
  RESET_QUIZ_VERSION,
  buildResetQuizHandoff,
  compactQuizBackground,
  enumerateResetQuizV2Distribution,
  pickResetQuizType,
  scoreResetQuiz,
} from "@/lib/analysis/reset/reset-quiz";
import { RESET_ANIMAL_ASSETS } from "@/lib/analysis/reset/reset-art";
import { RESET_CONVERSATION_REASONING_PROMPT, buildResetConversationSystemPrompt, buildResetReportSystemPrompt, RESET_REPORT_REASONING_PROMPT } from "@/lib/analysis/reset/reset-prompts";
import { RESET_OPENING } from "@/lib/analysis/reset/reset-path";
import { RESET_REPORT_TITLES } from "@/lib/analysis/reset/reset-report";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function allSemantic(type: PersonalityType) {
  return RESET_QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: `${question.id}_${type}`,
  }));
}

describe("RESET-QUIZ-V2 structural scoring", () => {
  it("A. each question has exactly 6 options", () => {
    expect(RESET_QUIZ_QUESTIONS).toHaveLength(6);
    for (const question of RESET_QUIZ_QUESTIONS) {
      expect(question.options).toHaveLength(6);
    }
    expect(RESET_QUIZ_QUESTIONS[0]!.text).toBe(
      "你原本打算今天好好顧一下自己的體態，但忙了一整天，終於有自己的時間。這時候，你通常會怎麼做？",
    );
  });

  it("B. display order is never semantic A–F", () => {
    for (const question of RESET_QUIZ_QUESTIONS) {
      const order = question.options.map((option) => option.semanticType);
      expect(order).toEqual(question.displayOrder);
      expect(order.join("")).not.toBe("ABCDEF");
      expect(new Set(order).size).toBe(6);
    }
  });

  it("C. every option is exactly primary +2 and secondary +1", () => {
    for (const question of RESET_QUIZ_QUESTIONS) {
      for (const option of question.options) {
        const pair = RESET_QUIZ_V2_MATRIX[question.id]![option.semanticType];
        expect(pair.primary).toBe(option.semanticType);
        expect(pair.secondary).not.toBe(pair.primary);
        const scored = scoreResetQuiz([{ questionId: question.id, optionId: option.id }]);
        expect(scored.scores[pair.primary]).toBe(2);
        expect(scored.scores[pair.secondary]).toBe(1);
        expect(scored.primaryHits[pair.primary]).toBe(1);
      }
    }
  });

  it("D. each type has the same number of primary opportunities", () => {
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
    for (const question of RESET_QUIZ_QUESTIONS) {
      for (const type of RESET_QUIZ_TYPES) {
        counts[RESET_QUIZ_V2_MATRIX[question.id]![type].primary] += 1;
      }
    }
    expect(new Set(Object.values(counts)).size).toBe(1);
    expect(counts.A).toBe(6);
  });

  it("E. secondary exposure is balanced across types", () => {
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
    for (const question of RESET_QUIZ_QUESTIONS) {
      for (const type of RESET_QUIZ_TYPES) {
        counts[RESET_QUIZ_V2_MATRIX[question.id]![type].secondary] += 1;
      }
    }
    expect(new Set(Object.values(counts)).size).toBe(1);
    expect(counts.A).toBe(6);
  });

  it("F–K. all-same semantic answers resolve to that primary", () => {
    for (const type of RESET_QUIZ_TYPES) {
      const scored = scoreResetQuiz(allSemantic(type));
      expect(scored.primaryType).toBe(type);
      expect(scored.winner).toBe(type);
      expect(scored.scores[type]).toBe(12);
      expect(scored.primaryHits[type]).toBe(6);
    }
  });

  it("L. tie-break is deterministic", () => {
    const answers = [
      { questionId: "Q1", optionId: "Q1_A" },
      { questionId: "Q2", optionId: "Q2_B" },
      { questionId: "Q3", optionId: "Q3_C" },
      { questionId: "Q4", optionId: "Q4_D" },
      { questionId: "Q5", optionId: "Q5_E" },
      { questionId: "Q6", optionId: "Q6_F" },
    ];
    const a = scoreResetQuiz(answers);
    const b = scoreResetQuiz(answers);
    expect(a.primaryType).toBe(b.primaryType);
    expect(a.secondaryType).toBe(b.secondaryType);
    expect(a.tieBreak).toEqual(b.tieBreak);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("M. Q6 tie-break prefers Q6 semantic primary in the tied set", () => {
    const picked = pickResetQuizType(
      { A: 8, B: 8, C: 3, D: 3, E: 3, F: 3 },
      { A: 3, B: 3, C: 1, D: 1, E: 1, F: 1 },
      [
        { question: "Q1", primary: "C", secondary: "D" },
        { question: "Q2", primary: "D", secondary: "E" },
        { question: "Q3", primary: "A", secondary: "D" },
        { question: "Q4", primary: "B", secondary: "F" },
        { question: "Q5", primary: "B", secondary: "A" },
        { question: "Q6", primary: "A", secondary: "C" },
      ],
    );
    expect(picked).toEqual({ type: "A", path: "q6" });
  });

  it("N. recent-primary tie-break walks Q5 → Q1", () => {
    const picked = pickResetQuizType(
      { A: 8, B: 8, C: 3, D: 3, E: 3, F: 3 },
      { A: 3, B: 3, C: 1, D: 1, E: 1, F: 1 },
      [
        { question: "Q1", primary: "A", secondary: "B" },
        { question: "Q2", primary: "D", secondary: "E" },
        { question: "Q3", primary: "A", secondary: "D" },
        { question: "Q4", primary: "B", secondary: "F" },
        { question: "Q5", primary: "B", secondary: "A" },
        { question: "Q6", primary: "C", secondary: "E" },
      ],
    );
    expect(picked).toEqual({ type: "B", path: "recent_primary" });
  });

  it("O. scoring has no Math.random", () => {
    expect(src("src/lib/analysis/reset/reset-quiz.ts")).not.toMatch(/Math\.random/);
  });

  it("P. conversation handoff authority is unverified_hypothesis", () => {
    const scored = scoreResetQuiz(allSemantic("A"));
    const handoff = buildResetQuizHandoff(scored);
    expect(handoff.source).toBe(RESET_QUIZ_VERSION);
    expect(handoff.authority).toBe("unverified_hypothesis");
    expect(handoff.primary.code).toBe("A");
    expect(handoff.primary.mechanism).toBe(RESET_ANIMAL_MECHANISM.A);
    const packed = compactQuizBackground(scored);
    expect(packed).toContain('"authority":"unverified_hypothesis"');
    expect(packed).not.toMatch(/USER IS A/);
    expect(packed).not.toContain("療癒胖象");
    expect(src("src/lib/analysis/reset/reset-service.ts")).toContain("compactQuizBackground(session.quiz.result)");
  });

  it("Q. spoken correction can still override quiz prior", () => {
    expect(RESET_CONVERSATION_REASONING_PROMPT).toContain("心理測驗結果只是未驗證背景，可以整個丟掉。使用者親口說的訂正立刻覆蓋它。");
    expect(buildResetConversationSystemPrompt()).toBe(RESET_CONVERSATION_REASONING_PROMPT);
  });

  it("R. Production /quiz/fat-loss serves RESET Quiz V2", () => {
    expect(src("src/app/quiz/fat-loss/page.tsx")).toContain("ResetLandingPage");
    expect(src("src/app/quiz/fat-loss/page.tsx")).not.toContain("useLegacyTwelveQuestion");
    expect(src("src/app/quiz/fat-loss/page.tsx")).not.toContain("if (isProductionRuntime())");
    expect(src("src/lib/analysis/reset/reset-path.ts")).toMatch(
      /export function isResetPreviewAllowed\(\): boolean \{\s*return true;/,
    );
  });

  it("S. Landing uses full key visual with transparent start hit", () => {
    const landing = src("src/components/reset/ResetExperienceViews.tsx").split("export function ResetQuizView")[0]!;
    expect(landing).toContain("/reset/landing-final.png");
    expect(landing).toContain("rx-kv-hit");
    expect(landing).toContain('aria-label="開始測驗"');
    expect(landing).not.toContain("rx-land-cta");
    expect(landing).not.toMatch(/characters\/[A-F]\.png/);
  });

  it("T. Reveal A–F character assets unchanged", () => {
    expect(RESET_ANIMAL_ASSETS.A.image).toBe("/reset/characters/A.png");
    expect(RESET_ANIMAL_ASSETS.E.image).toBe("/reset/characters/E.png");
    expect(RESET_ANIMAL_COPY.A.animalName).toBe("療癒胖象");
    expect(RESET_ANIMAL_PERSONALITY.A).toContain("照顧辛苦的自己");
  });

  it("U. Conversation / report contract unchanged", () => {
    expect(buildResetConversationSystemPrompt()).toBe(RESET_CONVERSATION_REASONING_PROMPT);
    expect(buildResetReportSystemPrompt()).toBe(RESET_REPORT_REASONING_PROMPT);
    expect(RESET_OPENING).toBe("你最近為什麼會開始想改變自己的體態？");
    expect(RESET_REPORT_TITLES).toEqual([
      "我真正看見你卡住的是什麼？",
      "為什麼以前的方法容易失敗？",
      "現在最值得先改哪一件事？",
    ]);
    expect(src("src/lib/analysis/reset/reset-engine.ts")).toContain("temperature: 0.7");
    expect(src("src/lib/analysis/reset/reset-path.ts")).toContain('RESET_MODEL = "gpt-4.1"');
  });

  it("exhaustive simulation has no structural dominance", () => {
    const dist = enumerateResetQuizV2Distribution();
    expect(dist.total).toBe(46656);
    expect(dist.shareSpread).toBeLessThanOrEqual(2);
    if (process.env.RESET_QUIZ_V2_PRINT_DIST === "1") {
      console.log(JSON.stringify(dist, null, 2));
    }
  });
});
