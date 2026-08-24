import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AppShell mobile bottom nav layout", () => {
  it("keeps AppBottomNav outside the padded page column", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "src/components/navigation/AppShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("{children}");
    expect(shell).toContain("{showNav ? <AppBottomNav /> : null}");

    const childrenIdx = shell.indexOf("{children}");
    const bottomNavIdx = shell.indexOf("{showNav ? <AppBottomNav /> : null}");
    expect(childrenIdx).toBeGreaterThan(-1);
    expect(bottomNavIdx).toBeGreaterThan(childrenIdx);

    const between = shell.slice(childrenIdx, bottomNavIdx);
    // Padding wrapper must close before AppBottomNav (sibling, not nested).
    expect(between).toContain("</div>");
    expect(between).not.toMatch(/\{children\}[\s\S]*AppBottomNav/);
  });

  it("avoids html/body overflow-x:hidden which forces overflow-y:auto", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).toContain("overflow-x: clip");
    expect(withoutComments).not.toMatch(/html\s*\{[^}]*overflow-x:\s*hidden/);
    expect(withoutComments).not.toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/);
  });

  it("keeps AppBottomNav fixed to the viewport bottom with safe-area padding", () => {
    const nav = readFileSync(
      resolve(process.cwd(), "src/components/navigation/AppNav.tsx"),
      "utf8",
    );
    expect(nav).toContain("fixed inset-x-0 bottom-0");
    expect(nav).toContain("pb-[env(safe-area-inset-bottom,0px)]");
    expect(nav).toContain("md:hidden");
  });
});
