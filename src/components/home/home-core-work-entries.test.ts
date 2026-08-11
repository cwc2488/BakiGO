import { describe, expect, it } from "vitest";
import { SIMPLE_QUICK_LINKS, WORK_HUB_LINKS } from "@/lib/ui/work-hub-links";

describe("home work hub links", () => {
  it("keeps guided consultation hidden from home navigation", () => {
    const serialized = JSON.stringify({ SIMPLE_QUICK_LINKS, WORK_HUB_LINKS });
    expect(serialized).not.toContain("/consultation/new");
    expect(serialized).not.toContain("引導式諮詢");
  });
});
