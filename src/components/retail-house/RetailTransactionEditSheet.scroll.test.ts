import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("RetailTransactionEditSheet — scroll lock + layout", () => {
  it("uses MobileFormModal with body scroll lock (same architecture as Calendar V2)", () => {
    const sheet = src("src/components/retail-house/RetailTransactionEditSheet.tsx");
    expect(sheet).toContain("MobileFormModal");
    expect(sheet).not.toContain("fixed inset-0 z-[70]");
    const modal = src("src/components/ui/MobileFormModal.tsx");
    expect(modal).toContain("useBodyScrollLock");
    expect(modal).toContain("z-[120]");
    expect(modal).toContain("100dvh");
    expect(modal).toContain("safe-area-inset-bottom");
    expect(modal).toContain("overscroll-contain");
  });

  it("keeps Delete in modal footer above bottom nav clearance", () => {
    const sheet = src("src/components/retail-house/RetailTransactionEditSheet.tsx");
    expect(sheet).toContain("刪除");
    expect(sheet).toContain("footer=");
    expect(sheet).toContain("儲存修改");
  });

  it("preserves coach-class VP=0 editable field", () => {
    const sheet = src("src/components/retail-house/RetailTransactionEditSheet.tsx");
    expect(sheet).toContain("Preserve 0 VP");
    expect(sheet).toContain("Number.isFinite(item.points)");
  });
});

describe("restoreCloudSession — awaited sync", () => {
  it("awaits cloud sync instead of fire-and-forget background sync", () => {
    const auth = src("src/lib/auth/auth-service.ts");
    expect(auth).toContain("awaitSync: true");
    expect(auth).not.toMatch(/restoreCloudSession[\s\S]*awaitSync:\s*false/);
  });
});
