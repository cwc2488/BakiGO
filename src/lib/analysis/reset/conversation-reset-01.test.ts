import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RESET_QUIZ_QUESTIONS, scoreResetQuiz } from "@/lib/analysis/reset/reset-quiz";
import { RESET_ANIMAL_COPY } from "@/lib/analysis/reset/reset-animals";
import {
  RESET_HARD_MAX_TURNS,
  RESET_MODEL,
  RESET_OPENING,
} from "@/lib/analysis/reset/reset-path";
import { createInitialResetSession, openingAssistantTurn } from "@/lib/analysis/reset/reset-contract";
import { processResetConversationAnswer } from "@/lib/analysis/reset/reset-engine";
import { buildResetConversationSystemPrompt } from "@/lib/analysis/reset/reset-prompts";
import { RESET_REPORT_TITLES, buildResetReportFixture } from "@/lib/analysis/reset/reset-report";
import { compactQuizBackground } from "@/lib/analysis/reset/reset-quiz";
import { DYNAMIC_QUIZ_BOUNDS } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("CONVERSATION-RESET-01 three-act Preview rebuild", () => {
  it("Preview landing is reset_v1; Production /quiz/fat-loss serves RESET Quiz V2", () => {
    const page = src("src/app/quiz/fat-loss/page.tsx");
    expect(page).toContain("ResetLandingPage");
    expect(page).not.toContain("if (isProductionRuntime())");
    expect(page).not.toContain("FatLossQuizLandingPage");
    expect(page).not.toContain("useLegacyTwelveQuestion");
    expect(src("src/app/api/analysis/sessions/route.ts")).toContain('body.entry === "reset_v1"');
    expect(src("src/app/api/analysis/reset/[token]/route.ts")).toContain("isResetPreviewAllowed");
    expect(src("src/components/quiz/FatLossQuizStartPage.tsx")).toContain("開始 12 題測驗");
  });

  it("quiz is fixed 6 projective scenarios, not consultation intake", () => {
    expect(RESET_QUIZ_QUESTIONS).toHaveLength(6);
    for (const question of RESET_QUIZ_QUESTIONS) {
      expect(question.options.length).toBe(6);
    }
    const blob = RESET_QUIZ_QUESTIONS.map((q) => q.text + q.options.map((o) => o.label).join("")).join("\n");
    expect(blob).not.toMatch(/最大阻礙|readiness|你為什麼想減肥|想先改善什麼/);
    expect(RESET_QUIZ_QUESTIONS[0]!.text).toMatch(/有自己的時間/);
    const scored = scoreResetQuiz(
      RESET_QUIZ_QUESTIONS.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
    );
    expect(Object.keys(RESET_ANIMAL_COPY)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(RESET_ANIMAL_COPY[scored.winner].animalName.length).toBeGreaterThan(2);
  });

  it("conversation loop does not reuse interview engines or old visual page", () => {
    const engine = src("src/lib/analysis/reset/reset-engine.ts");
    expect(engine).not.toMatch(/interview-engine|understanding_patch|information gain|namedHighValueGap/);
    expect(src("src/lib/analysis/reset/reset-service.ts")).not.toContain("AnalysisFlowPage");
    expect(src("src/components/reset/ResetExperiencePage.tsx")).toContain("ResetShell");
    expect(src("src/app/analysis/[token]/page.tsx")).toContain("AnalysisExperienceSwitch");
    expect(RESET_OPENING).toBe("你最近為什麼會開始想改變自己的體態？");
    expect(openingAssistantTurn().text).toBe(RESET_OPENING);
    expect(RESET_MODEL).toBe("gpt-4.1");
    expect(RESET_HARD_MAX_TURNS).toBe(10);
  });

  it("system prompt owns WHY NOW / bottleneck and user-owned goals", () => {
    const prompt = buildResetConversationSystemPrompt();
    expect(prompt).toMatch(/WHY NOW/);
    expect(prompt).toMatch(/REAL BOTTLENECK/);
    expect(prompt).toMatch(/使用者擁有目標/);
    expect(prompt).not.toMatch(/information gain|questionnaire|coverage|slot filling/i);
    expect(prompt).toContain("Ask 不是預設");
  });

  it("fixture conversation can ask zero extra questions and keeps full transcript", async () => {
    const start = createInitialResetSession();
    start.conversation.turns = [openingAssistantTurn()];
    const result = await processResetConversationAnswer({
      conversation: start.conversation,
      value: "我很愛吃",
      compactQuizBackground: compactQuizBackground(RESET_ANIMAL_COPY.E),
    });
    expect(result.conversation.turns).toHaveLength(3);
    expect(result.conversation.turns.map((t) => t.text).join("\n")).toContain("我很愛吃");
    expect(result.conversation.complete).toBe(false);
  });

  it("report is three distinct consumer questions", () => {
    expect(RESET_REPORT_TITLES).toHaveLength(3);
    const report = buildResetReportFixture();
    expect(report.why_now).not.toBe(report.bottleneck);
    expect(src("src/components/reset/ResetExperienceViews.tsx")).toContain("聊完之後，我真正看到的是——");
    expect(src("src/components/reset/ResetExperienceViews.tsx")).not.toContain("section4_lifestyle");
  });

  it("does not modify Coaching 037, Production 12-q bounds, or add a migration", () => {
    expect(src("src/lib/coaching/coaching-service.ts")).not.toContain("experience_21d_interests");
    expect(DYNAMIC_QUIZ_BOUNDS.hardMax).toBe(8);
    expect(src("docs/DATABASE.md")).toContain("CONVERSATION-RESET-01");
    expect(src("src/lib/analysis/reset/reset-engine.ts")).not.toContain("coaching_daily");
  });
});
