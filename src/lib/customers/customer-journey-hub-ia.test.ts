import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CUSTOMER_JOURNEY_HUB_SECTIONS,
  flattenCustomerJourneyHubItems,
} from "@/lib/customers/customer-journey-hub-items";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("CustomerJourneyHub IA (51f04e9 five-section restore)", () => {
  it("renders five journey sections on /customers", () => {
    expect(CUSTOMER_JOURNEY_HUB_SECTIONS.map((section) => section.title)).toEqual([
      "找新顧客",
      "正在接觸",
      "我的顧客",
      "陪跑",
      "成果與分享",
    ]);

    const page = read("src/components/customers/CustomerJourneyHubPage.tsx");
    expect(page).toContain("CUSTOMER_JOURNEY_HUB_SECTIONS");
    expect(page).toContain("找人 → 接觸 → 顧客 → 陪跑 → 成果與分享");
  });

  it("keeps required customer journey entries", () => {
    const titles = flattenCustomerJourneyHubItems().map((item) => item.title);
    expect(titles).toEqual([
      "AI Radar",
      "我的名單",
      "心理測驗",
      "待聯絡／Pipeline",
      "導引諮詢",
      "待諮詢顧客",
      "顧客列表",
      "陪跑指揮中心",
      "轉介紹中心",
    ]);
  });

  it("keeps a clickable 心理測驗 entry pointing at /quiz/hub", () => {
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

  it("does not modify recognition, admin, or leaderboard modules", () => {
    const page = read("src/components/customers/CustomerJourneyHubPage.tsx");
    const items = read("src/lib/customers/customer-journey-hub-items.ts");
    expect(page).not.toContain("recognition");
    expect(items).not.toContain("recognition");
    expect(page).not.toMatch(/leaderboard|20699471|super-admin/i);
    expect(items).not.toMatch(/leaderboard|20699471|super-admin/i);
  });
});
