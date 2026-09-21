import { describe, expect, it } from "vitest";
import { CUSTOMER_JOURNEY_HUB_ITEMS } from "@/lib/customers/customer-journey-hub-items";

describe("CustomerJourneyHub IA", () => {
  it("retains only 我的顧客 after Production Cleanup", () => {
    const titles = CUSTOMER_JOURNEY_HUB_ITEMS.map((item) => item.title);
    expect(titles).toEqual(["我的顧客"]);
    expect(titles).not.toContain("待聯絡");
    expect(titles).not.toContain("正在接觸");
    expect(titles).not.toContain("AI Radar");
    expect(titles).not.toContain("我的名單");
    expect(titles).not.toContain("名單追蹤");
    expect(titles).not.toContain("心理測驗");
    expect(titles).not.toContain("陪跑");
    expect(titles).not.toContain("轉介紹中心");
  });

  it("links 我的顧客 to the customer list", () => {
    const customers = CUSTOMER_JOURNEY_HUB_ITEMS.find((item) => item.title === "我的顧客");
    expect(customers).toMatchObject({
      href: "/customers/list",
      title: "我的顧客",
    });
    expect(customers?.comingSoon).toBeFalsy();
    expect(customers?.locked).toBeFalsy();
  });
});
