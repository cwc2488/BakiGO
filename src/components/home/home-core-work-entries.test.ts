import { describe, expect, it } from "vitest";
import { SIMPLE_QUICK_LINKS, WORK_HUB_LINKS } from "@/lib/ui/work-hub-links";

describe("home work hub links", () => {
  it("includes guided consultation in simple and full home grids", () => {
    expect(SIMPLE_QUICK_LINKS.some((link) => link.href === "/consultation/new")).toBe(true);
    expect(
      WORK_HUB_LINKS.some(
        (link) => link.href === "/consultation/new" && link.title === "引導式諮詢",
      ),
    ).toBe(true);
  });
});
