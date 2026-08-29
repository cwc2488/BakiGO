import { describe, expect, it } from "vitest";
import { CUSTOMER_JOURNEY_HUB_ITEMS } from "@/lib/customers/customer-journey-hub-items";

describe("CustomerJourneyHub IA", () => {
  it("does not include 待聯絡 / 正在接觸 as top-level entries", () => {
    const titles = CUSTOMER_JOURNEY_HUB_ITEMS.map((item) => item.title);
    expect(titles).not.toContain("待聯絡");
    expect(titles).not.toContain("正在接觸");
    expect(titles.join(" ")).not.toMatch(/待聯絡|正在接觸/);
  });

  it("keeps AI Radar connected to /radar", () => {
    const radar = CUSTOMER_JOURNEY_HUB_ITEMS.find((item) => item.title === "AI Radar");
    expect(radar).toMatchObject({
      href: "/radar",
      title: "AI Radar",
      desc: "尋找新名單",
    });
    expect(radar?.comingSoon).toBeFalsy();
  });

  it("wires 心理測驗 to the canonical Partner Hub at /quiz/21d", () => {
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
      desc: "21 天名單・分享測驗・成效",
      waitingBadge: true,
    });
    expect(quiz?.comingSoon).toBeFalsy();
    expect(quiz?.locked).toBeFalsy();
    expect(quiz?.href).toBe("/quiz/21d");
    expect(quiz?.href).not.toBe("/quiz/hub");
  });
});
