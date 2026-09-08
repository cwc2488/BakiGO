import { describe, expect, it } from "vitest";
import { isAdminCenterApiPath, isAdminCenterPagePath } from "@/lib/auth/admin-access";
import { isPublicPath } from "@/lib/auth/public-paths";

describe("cleaning roster admin surface paths", () => {
  it("nests under Admin Center page + API gates", () => {
    expect(isAdminCenterPagePath("/admin/cleaning-roster")).toBe(true);
    expect(isAdminCenterApiPath("/api/admin/cleaning-roster")).toBe(true);
    expect(isAdminCenterApiPath("/api/admin/cleaning-roster/draw")).toBe(true);
    expect(isAdminCenterApiPath("/api/admin/cleaning-roster/confirm")).toBe(true);
    expect(isPublicPath("/admin/cleaning-roster")).toBe(false);
    expect(isPublicPath("/api/admin/cleaning-roster")).toBe(false);
  });
});
