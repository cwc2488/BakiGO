import { describe, expect, it } from "vitest";
import { CUSTOMER_JOURNEY_HUB_ITEMS } from "@/lib/customers/customer-journey-hub-items";

describe("CustomerJourneyHub IA", () => {
  it("does not include 待聯絡 / 正在接觸 as top-level entries", () => {
    const titles = CUSTOMER_JOURNEY_HUB_ITEMS.map((item) => item.title);
    expect(titles).not.toContain("待聯絡");
    expect(titles).not.toContain("正在接觸");
    expect(titles.join(" ")).not.toMatch(/待聯絡|正在接觸/);
  });

  it("keeps a clickable 心理測驗 partner entry after 我的名單", () => {
    const titles = CUSTOMER_JOURNEY_HUB_ITEMS.map((item) => item.title);
    expect(titles).toEqual([
      "AI Radar",
      "我的名單",
      "心理測驗",
      "我的顧客",
      "陪跑",
      "轉介紹中心",
    ]);

    const quiz = CUSTOMER_JOURNEY_HUB_ITEMS.find((item) => item.title === "心理測驗");
    expect(quiz).toMatchObject({
      href: "/quiz/21d",
      title: "心理測驗",
      desc: "分享測驗，聯絡想了解 21 天的人",
      iconHref: "/quiz/21d",
      waitingBadge: true,
    });
    expect(quiz?.comingSoon).toBeFalsy();
    expect(quiz?.locked).toBeFalsy();
    expect(quiz?.href).toBeTruthy();
  });
});
