import { describe, expect, it } from "vitest";
import { MY_WORLD_SECONDARY_LINKS, SIDE_NAV_EXTRA_LINKS } from "@/lib/ui/work-hub-links";
import { MY_HOME_BUSINESS_ENTRIES } from "@/lib/home/my-home-presentation";

describe("three-world work links", () => {
  it("keeps Meta Review out of my-world secondary links and exposes Radar", () => {
    const serialized = JSON.stringify({ MY_WORLD_SECONDARY_LINKS, SIDE_NAV_EXTRA_LINKS });
    expect(serialized).not.toContain("/meta-review");
    expect(SIDE_NAV_EXTRA_LINKS.some((link) => link.href === "/radar")).toBe(true);
    expect(MY_WORLD_SECONDARY_LINKS.some((link) => link.href === "/radar")).toBe(true);
  });

  it("places guided consultation in customer journey, not my-world secondary", () => {
    const serialized = JSON.stringify(MY_WORLD_SECONDARY_LINKS);
    expect(serialized).not.toContain("/consultation/new");
  });

  it("limits primary business entries on home", () => {
    expect(MY_HOME_BUSINESS_ENTRIES.length).toBeLessThanOrEqual(5);
  });
});
