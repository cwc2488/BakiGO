import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("META-PIXEL-01 — Public Quiz consumer-only", () => {
  it("mounts MetaPixel only on public quiz consumer layouts", () => {
    expect(src("src/app/quiz/fat-loss/layout.tsx")).toContain("MetaPixel");
    expect(src("src/app/q/[code]/layout.tsx")).toContain("MetaPixel");
    expect(src("src/app/s/[code]/layout.tsx")).toContain("MetaPixel");
    expect(src("src/app/analysis/layout.tsx")).toContain("MetaPixel");
  });

  it("does not mount MetaPixel on Partner Hub, root shell, Radar, or Admin", () => {
    expect(src("src/app/layout.tsx")).not.toContain("MetaPixel");
    expect(src("src/app/quiz/21d/page.tsx")).not.toContain("MetaPixel");
    expect(src("src/components/quiz/QuizPartnerWorkbench.tsx")).not.toContain("MetaPixel");
    expect(src("src/app/admin/layout.tsx")).not.toContain("MetaPixel");
    const workbenchTree = src("src/components/navigation/AppShell.tsx");
    expect(workbenchTree).not.toContain("MetaPixel");
  });

  it("no-ops without NEXT_PUBLIC_META_PIXEL_ID and only tracks PageView this phase", () => {
    const pixel = src("src/components/meta/MetaPixel.tsx");
    expect(pixel).toContain("NEXT_PUBLIC_META_PIXEL_ID");
    expect(pixel).toContain('fbq("track", "PageView")');
    expect(pixel).toContain("if (!pixelId) return null");
    expect(pixel).not.toContain("Lead");
    expect(pixel).not.toContain("CompleteRegistration");
    expect(pixel).not.toContain("Purchase");
    expect(pixel).not.toContain("QuizStart");
    expect(pixel).not.toContain("QuizComplete");
  });
});
