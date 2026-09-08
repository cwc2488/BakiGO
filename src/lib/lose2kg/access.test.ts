import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isAdminCenterApiPath, isAdminCenterPagePath } from "@/lib/auth/admin-access";
import { isPublicPath } from "@/lib/auth/public-paths";

const ROOT = process.cwd();

describe("lose2kg access boundaries", () => {
  it("keeps admin surfaces Super-Admin-only and public ticket/draw open", () => {
    expect(isAdminCenterPagePath("/admin/lose2kg")).toBe(true);
    expect(isAdminCenterPagePath("/admin/lose2kg/temp-draw")).toBe(true);
    expect(isAdminCenterApiPath("/api/admin/lose2kg")).toBe(true);
    expect(isPublicPath("/admin/lose2kg")).toBe(false);
    expect(isPublicPath("/lose2kg/abc123tokenvaluehere")).toBe(true);
    expect(isPublicPath("/lose2kg/draw/abc123tokenvaluehere")).toBe(true);
  });

  it("does not hardcode Super Admin member number in lose2kg UI/routes", () => {
    const files = [
      "src/components/lose2kg/Lose2kgHomePage.tsx",
      "src/components/admin/AdminCenterPage.tsx",
      "src/app/admin/lose2kg/page.tsx",
      "src/lib/lose2kg/api.ts",
    ];
    for (const rel of files) {
      expect(readFileSync(resolve(ROOT, rel), "utf8"), rel).not.toContain("20699471");
    }
  });

  it("admin APIs require assertSuperAdmin via requireLose2kgAdmin", () => {
    const api = readFileSync(resolve(ROOT, "src/lib/lose2kg/api.ts"), "utf8");
    expect(api).toContain("assertSuperAdmin");
    expect(api).toContain("getMemberIdFromRequest");
  });

  it("public APIs do not import admin auth helpers", () => {
    const publicTicket = readFileSync(
      resolve(ROOT, "src/app/api/lose2kg/public/[token]/route.ts"),
      "utf8",
    );
    const publicDraw = readFileSync(
      resolve(ROOT, "src/app/api/lose2kg/draw/[token]/route.ts"),
      "utf8",
    );
    expect(publicTicket).not.toContain("requireLose2kgAdmin");
    expect(publicDraw).not.toContain("requireLose2kgAdmin");
  });
});
