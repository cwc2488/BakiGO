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

  it("keeps AppBottomNav outside the max-w page chrome wrapper", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "src/components/navigation/AppShell.tsx"),
      "utf8",
    );
    const wrapperOpen = shell.indexOf('className="min-h-full max-w-[100vw]"');
    const bottomNavIdx = shell.indexOf("{showNav ? <AppBottomNav /> : null}");
    expect(wrapperOpen).toBeGreaterThan(-1);
    expect(bottomNavIdx).toBeGreaterThan(wrapperOpen);

    // Closing the max-w wrapper must happen before AppBottomNav is rendered.
    const afterWrapperStart = shell.slice(wrapperOpen, bottomNavIdx);
    const closes = (afterWrapperStart.match(/<\/div>/g) ?? []).length;
    expect(closes).toBeGreaterThanOrEqual(3);
    expect(shell.slice(bottomNavIdx - 40, bottomNavIdx)).not.toContain("max-w-[100vw]");
  });

  it("avoids html/body overflow-x:hidden which forces overflow-y:auto", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).toContain("overflow-x: clip");
    expect(withoutComments).toMatch(/body\s*\{[^}]*overflow-y:\s*visible/);
    expect(withoutComments).toMatch(/html\s*\{[^}]*overflow-y:\s*visible/);
    expect(withoutComments).not.toMatch(/html\s*\{[^}]*overflow-x:\s*hidden/);
    expect(withoutComments).not.toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/);
  });

  it("locks AppBottomNav viewport-fixed contract via dedicated CSS class", () => {
    const nav = readFileSync(
      resolve(process.cwd(), "src/components/navigation/AppNav.tsx"),
      "utf8",
    );
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(nav).toContain('className="app-bottom-nav md:hidden"');
    expect(nav).toContain("md:hidden");
    expect(css).toMatch(/\.app-bottom-nav\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.app-bottom-nav\s*\{[^}]*bottom:\s*0/);
    expect(css).toMatch(/\.app-bottom-nav\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/\.app-bottom-nav\s*\{[^}]*left:\s*0/);
    expect(css).toMatch(/\.app-bottom-nav\s*\{[^}]*right:\s*0/);
  });

  it("keeps desktop side nav fixed and independent of bottom nav", () => {
    const nav = readFileSync(
      resolve(process.cwd(), "src/components/navigation/AppNav.tsx"),
      "utf8",
    );
    expect(nav).toContain("fixed inset-y-0 left-0");
    expect(nav).toContain("hidden w-[5.75rem]");
    expect(nav).toContain("md:flex");
  });
});
