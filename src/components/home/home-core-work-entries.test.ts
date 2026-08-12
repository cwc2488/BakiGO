import { describe, expect, it } from "vitest";
import { MY_WORLD_SECONDARY_LINKS, SIDE_NAV_EXTRA_LINKS } from "@/lib/ui/work-hub-links";

describe("three-world work links", () => {
  it("keeps Meta Review and Radar out of my-world secondary links", () => {
    const serialized = JSON.stringify({ MY_WORLD_SECONDARY_LINKS, SIDE_NAV_EXTRA_LINKS });
    expect(serialized).not.toContain("/meta-review");
    expect(serialized).not.toContain("/radar");
  });

  it("places guided consultation in customer journey, not my-world secondary", () => {
    const serialized = JSON.stringify(MY_WORLD_SECONDARY_LINKS);
    expect(serialized).not.toContain("/consultation/new");
  });
});
