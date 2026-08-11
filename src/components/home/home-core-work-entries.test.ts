import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("home core work entries", () => {
  it("links consultation entry to /consultation/new", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/home/HomeCoreWorkEntries.tsx"),
      "utf8",
    );
    expect(source).toContain('title="引導式諮詢"');
    expect(source).toContain('href="/consultation/new"');
    expect(source).toContain("開始諮詢 →");
  });
});
