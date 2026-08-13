import { describe, expect, it } from "vitest";
import { CUSTOMER_JOURNEY_HUB_ITEMS } from "@/lib/customers/customer-journey-hub-items";

describe("CustomerJourneyHub IA", () => {
  it("does not include 待聯絡 / 正在接觸 as top-level entries", () => {
    const titles = CUSTOMER_JOURNEY_HUB_ITEMS.map((item) => item.title);
    expect(titles).not.toContain("待聯絡");
    expect(titles).not.toContain("正在接觸");
    expect(titles.join(" ")).not.toMatch(/待聯絡|正在接觸/);
  });
});
