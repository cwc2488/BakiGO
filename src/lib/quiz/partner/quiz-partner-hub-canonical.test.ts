import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CUSTOMER_JOURNEY_HUB_ITEMS } from "@/lib/customers/customer-journey-hub-items";
import { SIDE_NAV_EXTRA_LINKS } from "@/lib/ui/work-hub-links";
import { QUIZ_PARTNER_RANGE_LABEL } from "@/lib/quiz/partner/quiz-partner-presentation";

describe("Canonical Partner Quiz Hub (QUIZ-PARTNER-HUB)", () => {
  it("keeps the logged-in APP 心理測驗 entry on /quiz/21d (not obsolete /quiz/hub)", () => {
    const quiz = CUSTOMER_JOURNEY_HUB_ITEMS.find((item) => item.title === "心理測驗");
    expect(quiz).toMatchObject({
      href: "/quiz/21d",
      title: "心理測驗",
      waitingBadge: true,
    });
    expect(quiz?.href).not.toBe("/quiz/hub");

    const side = SIDE_NAV_EXTRA_LINKS.find((item) => item.title === "心理測驗");
    expect(side?.href).toBe("/quiz/21d");
  });

  it("preserves Partner Hub tabs, funnel, and conversion fingerprint", () => {
    const workbench = readFileSync(
      resolve(process.cwd(), "src/components/quiz/QuizPartnerWorkbench.tsx"),
      "utf8",
    );
    const performance = readFileSync(
      resolve(process.cwd(), "src/components/quiz/QuizPartnerPerformancePanel.tsx"),
      "utf8",
    );
    const route = readFileSync(resolve(process.cwd(), "src/app/quiz/21d/page.tsx"), "utf8");

    expect(route).toContain("QuizPartnerWorkbench");
    expect(route).toContain("Canonical logged-in Partner Quiz Hub");

    expect(workbench).toContain("有人主動想了解，你現在只要去跟他聊。");
    expect(workbench).toContain("21 天名單");
    expect(workbench).toContain("我的分享");
    expect(workbench).toContain("我的成效");
    expect(workbench).toContain('/api/quiz/21d');
    expect(workbench).toContain("/api/quiz/21d/share");
    expect(workbench).toContain("/api/quiz/21d/performance");

    expect(performance).toContain("真人瀏覽");
    expect(performance).toContain("開始測驗");
    expect(performance).toContain("完成測驗");
    expect(performance).toContain("完成 AI 分析");
    expect(performance).toContain("想了解 21 天");
    expect(performance).toContain("已成交");
    expect(performance).toContain("測驗完成率");
    expect(performance).toContain("Report → 21D 意向率");
    expect(performance).toContain("21D 意向 → 成交率");

    expect(QUIZ_PARTNER_RANGE_LABEL).toMatchObject({
      "7d": "近 7 天",
      month: "本月",
      all: "全部",
    });
  });

  it("distinguishes Partner Hub from public consumer Quiz hub shell", () => {
    const publicHub = readFileSync(
      resolve(process.cwd(), "src/components/quiz/QuizHubPage.tsx"),
      "utf8",
    );
    expect(publicHub).toContain("用測驗開啟話題");
    expect(publicHub).not.toContain("21 天名單");
    expect(publicHub).not.toContain("我的成效");
  });
});
