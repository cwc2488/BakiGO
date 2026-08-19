import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QUIZ_HUB_ITEMS } from "@/lib/quiz/quiz-hub-catalog";
import { flattenCustomerJourneyHubItems } from "@/lib/customers/customer-journey-hub-items";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Quiz Hub restoration (pre-drop 51f04e9)", () => {
  it("Customer Hub keeps the original clickable 心理測驗 entry pointing at /quiz/hub", () => {
    const quiz = flattenCustomerJourneyHubItems().find((item) => item.title === "心理測驗");
    expect(quiz).toMatchObject({
      href: "/quiz/hub",
      title: "心理測驗",
      desc: "用測驗開啟話題",
      iconHref: "/quiz/hub",
    });
    expect(quiz?.comingSoon).toBeFalsy();
    expect(quiz?.locked).toBeFalsy();
  });

  it("Quiz Hub still exposes 分享測驗 and 查看名單 on the existing catalog", () => {
    const hub = read("src/components/quiz/QuizHubPage.tsx");
    expect(hub).toContain("分享測驗");
    expect(hub).toContain("查看名單");
    expect(hub).toContain("manageHref");
    expect(hub).toContain("leadsHref");

    expect(QUIZ_HUB_ITEMS).toHaveLength(1);
    expect(QUIZ_HUB_ITEMS[0]).toMatchObject({
      slug: "fat-loss",
      manageHref: "/quiz/manage",
      leadsHref: "/quiz/leads",
    });
  });

  it("does not remove the quiz leads / response pages", () => {
    expect(read("src/app/quiz/leads/page.tsx")).toContain("QuizLeadsPage");
    expect(read("src/components/quiz/QuizLeadsPage.tsx")).toContain("/api/quiz/leads");
    expect(read("src/components/quiz/QuizLeadsPage.tsx")).toContain("/quiz/results/");
    expect(read("src/app/quiz/results/[resultId]/page.tsx")).toContain("QuizIntelligencePage");
    expect(read("src/app/api/quiz/leads/route.ts")).toContain("listQuizResultsForMember");
  });

  it("does not rewrite Recognition Center as part of this quiz restoration", () => {
    const hubItems = read("src/lib/customers/customer-journey-hub-items.ts");
    const quizHub = read("src/components/quiz/QuizHubPage.tsx");
    expect(hubItems).not.toContain("recognition");
    expect(quizHub).not.toContain("recognition");
  });
});
